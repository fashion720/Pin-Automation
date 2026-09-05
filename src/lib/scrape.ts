import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import { promises as dns } from "dns";
import { isIP } from "net";

/**
 * Blocks scrapeArticle from being used as an open SSRF proxy: rejects
 * localhost, link-local/cloud-metadata, and private RFC1918 ranges,
 * both when given directly as the hostname and after DNS resolution.
 */
async function assertSafeTarget(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Invalid article URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http/https URLs are allowed");
  }

  const hostname = parsed.hostname.toLowerCase();

  const isPrivateIp = (ip: string): boolean => {
    if (ip === "127.0.0.1" || ip === "::1") return true;
    if (ip.startsWith("169.254.")) return true; // link-local / cloud metadata
    if (ip.startsWith("10.")) return true;
    if (ip.startsWith("192.168.")) return true;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) return true; // 172.16.0.0/12
    if (ip.startsWith("fc") || ip.startsWith("fd")) return true; // unique local IPv6
    if (ip.startsWith("fe80:")) return true; // link-local IPv6
    return false;
  };

  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "metadata.google.internal"
  ) {
    throw new Error("Blocked target host");
  }

  if (isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error("Blocked target host");
  } else {
    const records = await dns.lookup(hostname, { all: true }).catch(() => []);
    for (const record of records) {
      if (isPrivateIp(record.address)) throw new Error("Blocked target host");
    }
  }

  return parsed;
}

export interface ScrapedImage {
  src: string;
  alt: string;
  heading: string;
  context: string;
}

export interface ScrapedArticle {
  url: string;
  title: string;
  author: string;
  publishedTime: string;
  images: ScrapedImage[];
}

function resolveImageSource($img: cheerio.Cheerio<AnyNode>, pageUrl: string): string {
  const direct = [
    $img.attr("src"),
    $img.attr("data-src"),
    $img.attr("data-lazy-src"),
    $img.attr("data-original"),
    $img.attr("data-image"),
  ].find(Boolean);

  const srcset = $img.attr("srcset") || $img.attr("data-srcset");
  const responsive = srcset
    ?.split(",")
    .map((candidate) => candidate.trim().split(/\s+/)[0])
    .filter(Boolean)
    .pop();

  const raw = responsive || direct || "";
  if (!raw) return "";

  try {
    return new URL(raw, pageUrl).toString();
  } catch {
    return "";
  }
}

function classText($element: cheerio.Cheerio<AnyNode>) {
  return `${$element.attr("class") || ""} ${$element.attr("id") || ""}`.toLowerCase();
}

function isExcludedContainer($img: cheerio.Cheerio<AnyNode>): boolean {
  const excluded = /(^|[-_ ])(related|recommend|recommended|popular|trending|sidebar|aside|footer|header|navbar|navigation|menu|author|avatar|comment|social|share|advert|sponsor)([-_ ]|$)/i;
  return $img.parents("aside, nav, header, footer, figure, div, section").toArray().some((node) => {
    const attributes = (node as AnyNode & { attribs?: Record<string, string> }).attribs || {};
    return excluded.test(`${attributes.class || ""} ${attributes.id || ""}`.toLowerCase());
  });
}

function isLikelyContentImage(src: string, $img: cheerio.Cheerio<AnyNode>): boolean {
  const lower = src.toLowerCase();
  if (
    lower.includes("logo") ||
    lower.includes("icon") ||
    lower.includes("avatar") ||
    lower.includes("sprite") ||
    lower.includes("tracking") ||
    lower.includes("pixel") ||
    lower.includes("/authors/") ||
    lower.endsWith(".svg")
  ) return false;

  if (isExcludedContainer($img)) return false;
  const width = Number($img.attr("width") || 0);
  const height = Number($img.attr("height") || 0);
  return !(width > 0 && height > 0 && width < 240 && height < 240);
}

function selectPrimaryArticleScope($: cheerio.CheerioAPI): cheerio.Cheerio<AnyNode> {
  // Prefer one primary article node. Selecting all <article> nodes was able to
  // pull recommendation cards into the same post on some magazine layouts.
  const selectors = [
    "article[itemtype*='Article']",
    "article",
    "[itemprop='articleBody']",
    "main article",
    "main",
    ".entry-content",
    ".post-content",
    ".article-content",
    ".post-body",
  ];
  for (const selector of selectors) {
    const match = $(selector).first();
    if (match.length) return match as cheerio.Cheerio<AnyNode>;
  }
  return $("body").first() as cheerio.Cheerio<AnyNode>;
}

function isLinkedToAnotherArticle($img: cheerio.Cheerio<AnyNode>, pageUrl: string): boolean {
  const href = $img.closest("a").attr("href");
  if (!href) return false;
  try {
    const page = new URL(pageUrl);
    const link = new URL(href, pageUrl);
    if (link.origin !== page.origin) return false;
    const pagePath = page.pathname.replace(/\/$/, "");
    const linkPath = link.pathname.replace(/\/$/, "");
    return linkPath !== pagePath && linkPath.length > 1;
  } catch {
    return false;
  }
}

export async function scrapeArticle(url: string): Promise<ScrapedArticle> {
  const normalizedUrl = url.trim();
  await assertSafeTarget(normalizedUrl);
  const res = await fetch(normalizedUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; PinAutomationBot/1.0; +https://example.com/bot)",
    },
  });

  if (!res.ok) throw new Error(`Failed to fetch article (${res.status} ${res.statusText})`);

  const html = await res.text();
  const $ = cheerio.load(html);
  const title =
    $('meta[property="og:title"]').attr("content")?.trim() ||
    $("title").first().text().trim() ||
    $("h1").first().text().trim();
  const author = $('meta[name="article:author"]').attr("content")?.trim() || $("[class*='author']").first().text().trim() || "";
  const publishedTime = $('meta[property="article:published_time"]').attr("content")?.trim() || "";
  const $scope = selectPrimaryArticleScope($);
  const images: ScrapedImage[] = [];
  const seen = new Set<string>();

  $scope.find("img").each((_, el) => {
    const $img = $(el);
    const src = resolveImageSource($img, normalizedUrl);
    if (!src || seen.has(src) || !isLikelyContentImage(src, $img) || isLinkedToAnotherArticle($img, normalizedUrl)) return;
    seen.add(src);

    const alt = $img.attr("alt")?.trim() || "";
    let heading = "";
    let context = "";
    const $heading = $img.closest("section, div, figure").prevAll("h2, h3").first();
    if ($heading.length) {
      heading = $heading.text().trim();
      context = $heading.nextUntil("h2, h3", "p").first().text().trim();
    } else {
      const allHeadings = $scope.find("h2, h3").toArray();
      for (const headingEl of allHeadings) {
        const $candidate = $(headingEl);
        if ($candidate.index() < $img.index()) heading = $candidate.text().trim();
      }
    }

    if (!context) context = $img.closest("figure").find("figcaption").text().trim();
    images.push({ src, alt, heading, context });
  });

  if (images.length === 0) {
    const ogImage = $('meta[property="og:image"]').attr("content")?.trim();
    if (ogImage) {
      const resolved = resolveImageSource($("<img>").attr("src", ogImage), normalizedUrl);
      if (resolved) images.push({ src: resolved, alt: title, heading: title, context: "" });
    }
  }

  return { url: normalizedUrl, title, author, publishedTime, images };
}
