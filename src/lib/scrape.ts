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
    const lookupPromise = dns.lookup(hostname, { all: true });
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("DNS lookup timeout")), 5000)
    );
    const records = await Promise.race([lookupPromise, timeoutPromise]).catch(() => []);
    for (const record of records) {
      if (isPrivateIp(record.address)) throw new Error("Blocked target host");
    }
  }

  return parsed;
}

export interface ScrapedImage {
  src: string;
  /** Alternate URLs for the same article image, e.g. srcset/lazy-load candidates. */
  candidates?: string[];
  alt: string;
  heading: string;
  context: string;
}

export interface ScrapedArticle {
  url: string;
  title: string;
  author: string;
  publishedTime: string;
  contentText: string;
  images: ScrapedImage[];
}

function resolveImageSources($img: cheerio.Cheerio<AnyNode>, pageUrl: string): string[] {
  const rawCandidates: string[] = [];
  for (const value of [
    $img.attr("src"),
    $img.attr("data-src"),
    $img.attr("data-lazy-src"),
    $img.attr("data-original"),
    $img.attr("data-image"),
    $img.attr("data-fallback-src"),
  ]) {
    if (value) rawCandidates.push(value);
  }

  for (const attr of ["srcset", "data-srcset", "data-lazy-srcset"]) {
    const srcset = $img.attr(attr);
    if (!srcset) continue;
    for (const candidate of srcset.split(",")) {
      const url = candidate.trim().split(/\s+/)[0];
      if (url) rawCandidates.push(url);
    }
  }

  $img.closest("picture").find("source").each((_, source) => {
    for (const attr of ["srcset", "data-srcset"]) {
      const attrs = (source as AnyNode & { attribs?: Record<string, string> }).attribs || {};
      const srcset = attrs[attr];
      if (!srcset) continue;
      for (const candidate of srcset.split(",")) {
        const url = candidate.trim().split(/\s+/)[0];
        if (url) rawCandidates.push(url);
      }
    }
  });

  const resolved: string[] = [];
  const seen = new Set<string>();
  for (const raw of rawCandidates) {
    try {
      const url = new URL(raw, pageUrl).toString();
      if (!seen.has(url)) {
        seen.add(url);
        resolved.push(url);
      }
    } catch {
      // Ignore malformed image candidates and continue with the next one.
    }
  }
  // Prefer the largest srcset candidate first, but retain every fallback URL.
  return resolved.reverse();
}

function classText($element: cheerio.Cheerio<AnyNode>) {
  return `${$element.attr("class") || ""} ${$element.attr("id") || ""}`.toLowerCase();
}

function isExcludedContainer($img: cheerio.Cheerio<AnyNode>): boolean {
  const excluded = /(^|[-_ ])(related|recommend|recommended|popular|trending|sidebar|aside|footer|header|navbar|navigation|menu|author|avatar|comment|social|share|advert|sponsor)([-_ ]|$)/i;
  const excludedAncestor = $img.parents("aside, nav, header, footer, div, section").toArray().some((node) => {
    const attributes = (node as AnyNode & { attribs?: Record<string, string> }).attribs || {};
    return excluded.test(`${attributes.class || ""} ${attributes.id || ""}`.toLowerCase());
  });
  if (excludedAncestor) return true;
  const figure = $img.closest("figure");
  if (figure.length) {
    const label = `${figure.attr("class") || ""} ${figure.attr("id") || ""}`.toLowerCase();
    if (excluded.test(label)) return true;
  }
  return false;
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
    lower.includes("/authors/")
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
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  let lastError = "";
  let html = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(normalizedUrl, {
        headers: {
          "User-Agent": attempt === 0
            ? "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36"
            : "Mozilla/5.0 (compatible; PinAutomationBot/2.0)",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Cache-Control": "no-cache",
        },
      });
      if (res.ok) {
        html = await res.text();
        break;
      }
      lastError = `Failed to fetch article (${res.status} ${res.statusText})`;
      // 404/410 are normally permanent; do not hammer a missing page.
      if (res.status === 404 || res.status === 410) break;
      const retryable = res.status === 408 || res.status === 425 || res.status === 429 || res.status >= 500;
      if (!retryable || attempt === 3) break;
      const retryAfter = Number(res.headers.get("retry-after") || 0);
      const backoff = retryAfter > 0 ? Math.min(retryAfter * 1000, 30000) : Math.min(1500 * 2 ** attempt, 12000);
      await sleep(backoff + Math.floor(Math.random() * 700));
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt === 3) break;
      await sleep(Math.min(1200 * 2 ** attempt, 10000) + Math.floor(Math.random() * 700));
    }
  }
  if (!html) throw new Error(lastError || "Failed to fetch article");
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
  const metadataImageUrls: string[] = [];
  for (const selector of [
    'meta[property="og:image"]',
    'meta[property="og:image:url"]',
    'meta[name="twitter:image"]',
    'meta[name="twitter:image:src"]',
  ]) {
    const value = $(selector).attr("content")?.trim();
    if (value) {
      try { metadataImageUrls.push(new URL(value, normalizedUrl).toString()); } catch { /* ignore */ }
    }
  }

  // JSON-LD often contains the canonical/full-resolution image even when the
  // visible <img> is lazy-loaded or protected behind a CDN transformation.
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const parsed = JSON.parse($(el).contents().text());
      const nodes = Array.isArray(parsed) ? parsed : [parsed];
      const visit = (value: unknown) => {
        if (!value || typeof value !== "object") return;
        if (Array.isArray(value)) { value.forEach(visit); return; }
        const obj = value as Record<string, unknown>;
        for (const key of ["image", "contentUrl", "thumbnailUrl"]) {
          const candidate = obj[key];
          if (typeof candidate === "string") {
            try { metadataImageUrls.push(new URL(candidate, normalizedUrl).toString()); } catch { /* ignore */ }
          } else if (candidate && typeof candidate === "object") visit(candidate);
        }
        for (const value of Object.values(obj)) {
          if (value && typeof value === "object") visit(value);
        }
      };
      nodes.forEach(visit);
    } catch { /* ignore malformed JSON-LD */ }
  });

  $scope.find("img").each((_, el) => {
    const $img = $(el);
    const candidates = resolveImageSources($img, normalizedUrl);
    const src = candidates[0] || "";
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
    images.push({ src, candidates, alt, heading, context });
  });

  // Metadata images are appended as additional logical candidates. They are
  // especially useful when the visible article images are lazy-loaded or a
  // particular CDN URL is blocked, while preserving normal DOM image ordering.
  for (const url of Array.from(new Set(metadataImageUrls))) {
    if (seen.has(url)) continue;
    seen.add(url);
    images.push({ src: url, candidates: [url], alt: title, heading: title, context: "" });
  }

  // Keep a compact, article-grounded text corpus for the copywriter. This is
  // intentionally limited so Gemini gets the useful editorial substance
  // instead of navigation/footer noise or an enormous page dump.
  const seenText = new Set<string>();
  const contentParts: string[] = [];
  $scope.find("h1,h2,h3,p,li").each((_, el) => {
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if(text.length<25 || seenText.has(text)) return;
    seenText.add(text);
    contentParts.push(text);
  });
  const contentText = contentParts.join("\n").slice(0,12000);

  return { url: normalizedUrl, title, author, publishedTime, contentText, images };
}
