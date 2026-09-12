import { GoogleGenerativeAI } from "@google/generative-ai";
import { getSettings } from "./settings";

export interface OverlaySuggestion {
  overlayText: string;
  keywords: string[];
  pinTitle: string;
  description: string;
  altText: string;
  tags: string[];
}

export interface OverlayBrief {
  variantNumber: number;
  layoutName: string;
  designBrief?: string;
  sourceHeading: string;
  sourceContext: string;
}

let client: GoogleGenerativeAI | null = null;
let clientKey: string | null = null;

/**
 * The key saved on the Settings page (stored in R2, persists across
 * deploys) takes priority over the GEMINI_API_KEY env var, so the key can
 * be changed from the UI without touching Vercel. The client is rebuilt
 * whenever the resolved key changes.
 */
async function getClient() {
  const settings = await getSettings();
  const key = settings.geminiApiKey || process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("Gemini API key missing — Settings mein daalo ya GEMINI_API_KEY .env.local mein add karo");
  }
  if (!client || clientKey !== key) {
    client = new GoogleGenerativeAI(key);
    clientKey = key;
  }
  return client;
}

function cleanText(value: unknown, fallback: string, maxLength: number): string {
  return String(value || fallback)
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function fallbackMetadata(articleTitle: string, brief: OverlayBrief): OverlaySuggestion {
  const title = cleanText(brief.sourceHeading || articleTitle, articleTitle, 100);
  const tags = articleTitle.toLowerCase().split(/[^a-z0-9]+/).filter((tag) => tag.length > 2).slice(0, 6);
  return {
    overlayText: title.slice(0, 90),
    keywords: tags,
    pinTitle: title,
    description: `${title}. Discover more ideas, tips, and inspiration in the full article.`,
    altText: `${title} Pinterest pin`,
    tags,
  };
}

async function generateContentWithRetry(model: ReturnType<GoogleGenerativeAI["getGenerativeModel"]>, prompt: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await model.generateContent(prompt);
    } catch (err) {
      lastError = err;
      const message = err instanceof Error ? err.message : String(err);
      const statusMatch = message.match(/\b(408|425|429|500|502|503|504)\b/);
      if (!statusMatch || attempt === 3) throw err;
      const status = Number(statusMatch[1]);
      const retryable = status === 408 || status === 425 || status === 429 || status >= 500;
      if (!retryable) throw err;
      const delay = Math.min(2000 * 2 ** attempt, 16000) + Math.floor(Math.random() * 900);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Gemini request failed");
}

/**
 * Generates a distinct visual overlay and complete Pinterest metadata for each
 * selected design in one structured request.
 */
export async function suggestOverlays(params: {
  articleTitle: string;
  articleContent?: string;
  userKeywords?: string;
  userAnnotations?: string;
  briefs: OverlayBrief[];
  model?: string;
}): Promise<Map<number, OverlaySuggestion>> {
  const resultMap = new Map<number, OverlaySuggestion>();
  const model = (await getClient()).getGenerativeModel({
    model: params.model || process.env.GEMINI_MODEL || "gemini-2.5-flash",
  });

  const briefText = params.briefs
    .map(
      (brief) =>
        `Variant ${brief.variantNumber}\nLayout: ${brief.layoutName}\nDesign direction: ${brief.designBrief || "Clean editorial Pinterest composition."}\nNearest article heading: ${brief.sourceHeading}\nArticle context: ${brief.sourceContext}`
    )
    .join("\n\n");

  const prompt = `You are an expert Pinterest creative director, SEO copywriter, and accessibility editor.
Create one distinct Pinterest pin package for every variant below. Use only the supplied article information; do not invent unsupported facts.

Article title: ${params.articleTitle}
User keywords: ${params.userKeywords || "(none)"}
User notes: ${params.userAnnotations || "(none)"}

Article content to mine for hooks and facts:
${params.articleContent || "(no extra article text available)"}

${briefText}

Rules for every variant:
- overlayText: 5-9 words, maximum 70 characters, and make it the main click-driving promise on the pin. Build it from a concrete idea, detail, result, mistake, transformation, comparison, or surprising takeaway that is actually supported by the article content. Use a curiosity gap when possible: tease the interesting payoff without giving away the whole answer/list.
- Prefer hook structures such as: “The Detail That Changes…”, “Why This Works So Well”, “The Mistake Almost Everyone Makes”, “X Ideas That Make…”, “The Trick Behind…”, or “How To Get…”. Rewrite them into natural article-specific language rather than copying a formula literally.
- The hook should make a Pinterest user think “I need to see the rest.” It must be persuasive without being deceptive: no unsupported claims, fake urgency, fabricated statistics, or sensational promises the article does not deliver.
- Do not simply repeat the article title. Do not summarize the entire article in the overlay. Do not use generic CTA copy such as “Click here”, “Read more”, “See the ideas”, or “Amazing tips”. No hashtags, emojis, or quotation marks.
- pinTitle: natural, specific Pinterest title, maximum 100 characters, centered on the primary search intent while still sounding editorial. Different enough from other variants to avoid duplicates.
- description: useful Pinterest description, 1-2 sentences, maximum 450 characters. Include relevant search terms naturally, explain the value of the article, and end with a soft curiosity-driven reason to visit the full post. Do not keyword-stuff.
- altText: factual accessibility description of the pin’s visual/article subject, maximum 250 characters. Do not say “image of” repeatedly and do not describe text or facts that are not supplied.
- tags: 3-8 short lowercase keyword phrases that are relevant to the article. Use the same core tags when appropriate, with a few variant-specific tags.
- Match tone to the listed design: refined for serif, punchy for condensed display, practical for warm clean layouts. Every variant must remain faithful to the article topic and use a distinct hook angle when the supplied content supports it.

Return ONLY valid JSON in exactly this shape:
{"variants":[{"variantNumber":1,"overlayText":"short phrase","pinTitle":"Pinterest title","description":"Pinterest description","altText":"Accessible visual description","tags":["tag1","tag2","tag3"]}]}`;

  let response: Awaited<ReturnType<typeof generateContentWithRetry>>;
  try {
    response = await generateContentWithRetry(model, prompt);
  } catch (err) {
    // A temporary Gemini outage should not destroy an otherwise valid pin batch.
    // The article can still be generated with grounded local fallback copy.
    console.warn(`[gemini] generation failed after retries; using fallback metadata — ${err instanceof Error ? err.message : err}`);
    for (const brief of params.briefs) resultMap.set(brief.variantNumber, fallbackMetadata(params.articleTitle, brief));
    return resultMap;
  }
  const raw = response.response.text().trim().replace(/```json|```/g, "").trim();

  try {
    const parsed = JSON.parse(raw);
    const variants = Array.isArray(parsed.variants) ? parsed.variants : [];
    for (const brief of params.briefs) {
      const fallback = fallbackMetadata(params.articleTitle, brief);
      const item = variants.find((variant: unknown) => {
        if (!variant || typeof variant !== "object") return false;
        return Number((variant as { variantNumber?: unknown }).variantNumber) === brief.variantNumber;
      }) as Record<string, unknown> | undefined;
      const tags = Array.isArray(item?.tags)
        ? item.tags.map((tag: unknown) => String(tag).trim().toLowerCase()).filter(Boolean).slice(0, 8)
        : fallback.tags;
      resultMap.set(brief.variantNumber, {
        overlayText: cleanText(item?.overlayText, fallback.overlayText, 90),
        keywords: tags,
        pinTitle: cleanText(item?.pinTitle, fallback.pinTitle, 100),
        description: cleanText(item?.description, fallback.description, 450),
        altText: cleanText(item?.altText, fallback.altText, 250),
        tags,
      });
    }
  } catch {
    for (const brief of params.briefs) resultMap.set(brief.variantNumber, fallbackMetadata(params.articleTitle, brief));
  }

  return resultMap;
}


export interface AIPinPrompt {
  variantNumber: number;
  styleId: string;
  styleLabel: string;
  prompt: string;
  pinTitle: string;
  description: string;
  altText: string;
  tags: string[];
  overlayText: string;
  ctaText: string;
  footerText: string;
}

export async function suggestAIPinPrompts(params: {
  articleTitle: string;
  articleContent?: string;
  articleUrl: string;
  styles: Array<{ id: string; label: string; direction: string }>;
  pinsPerArticle: number;
  model?: string;
}): Promise<AIPinPrompt[]> {
  const model = (await getClient()).getGenerativeModel({
    model: params.model || process.env.GEMINI_MODEL || "gemini-2.5-flash",
  });

  const styles = Array.from({ length: params.pinsPerArticle }, (_, index) => {
    const selected = params.styles[index % params.styles.length];
    return {
      variantNumber: index + 1,
      styleId: selected.id,
      styleLabel: selected.label,
      direction: selected.direction,
    };
  });

  const domain = (() => {
    try { return new URL(params.articleUrl).hostname.replace(/^www\./i, "").toUpperCase(); }
    catch { return ""; }
  })();

  const styleText = styles.map((style) =>
    `Variant ${style.variantNumber}
Style: ${style.styleLabel}
Visual direction: ${style.direction}`
  ).join("\n\n");

  const prompt = `You are an expert Pinterest creative director and image-generation prompt engineer.
The user is going to use Google Flow to generate NEW original editorial images. Do NOT ask Flow to reproduce, trace, or use the article's existing images.

ARTICLE URL: ${params.articleUrl}
ARTICLE TITLE: ${params.articleTitle}

ARTICLE CONTENT:
${(params.articleContent || "").slice(0, 24000)}

SELECTED PIN VARIANTS:
${styleText}

Create one distinct package per variant.

Rules:
- Each visual prompt must be directly grounded in the article's subject, audience, setting, season, objects, colors, or practical advice.
- The visual must be a fresh AI-generated editorial image, not a collage of the source article images.
- Create a Pinterest-ready vertical visual. The browser worker will set Google Flow's aspect-ratio control to 9:16; do not rely on words like “9:16” in the prompt to set the UI ratio.
- The generated visual itself must be composed to leave intentional space for typography when the selected style calls for it.
- Do not add random, invented, fake, or misspelled text. For styles that require typography, return the exact headline/CTA/footer strings separately so the app can render them cleanly after download.
- No watermarks, logos, UI, borders, mockups, screenshots, or fake website elements.
- Make every variant visually different even when the styles repeat: change scene, subject, camera angle, styling, environment, or composition while staying faithful to the article.
- Never invent a factual product, celebrity, location, statistic, or event not supported by the article.
- The prompt must leave safe negative space where the selected style needs an overlay/banner, but should not describe the banner itself as a physical object.
- Use concise, production-ready language. No markdown.

For Pinterest copy:
- pinTitle: specific search-intent title, <=100 chars.
- description: 1-2 useful sentences, <=450 chars, natural SEO terms and a curiosity-driven reason to visit the article.
- altText: factual accessibility description, <=250 chars.
- tags: 4-8 lowercase search phrases.
- overlayText: the exact main headline to use in the final pin, 5-9 words, maximum 70 characters, article-specific curiosity hook.
- ctaText: short CTA, usually “READ MORE IDEAS”, “SEE THE FULL GUIDE”, or another natural 2-4 word CTA.
- footerText: the site/domain footer, use this exact value when available: ${domain || "article website"}.
- For bottom-banner, big-text-overlay, top-bottom, centre, collage-3, and collage-4 styles, the final image should visibly include typography after the app's post-processing step: headline + CTA where appropriate + small footer.
- The hook should create a curiosity gap without fake claims, unsupported urgency, or clickbait.

Return ONLY JSON:
{"variants":[{"variantNumber":1,"styleId":"...","styleLabel":"...","prompt":"...","overlayText":"...","ctaText":"READ MORE IDEAS","footerText":"SITE.COM","pinTitle":"...","description":"...","altText":"...","tags":["tag1","tag2"]}]}`;

  try {
    const response = await generateContentWithRetry(model, prompt);
    const raw = response.response.text().trim().replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed.variants) ? parsed.variants : [];

    return styles.map((style) => {
      const item = items.find((candidate: unknown) =>
        candidate && typeof candidate === "object" &&
        Number((candidate as { variantNumber?: unknown }).variantNumber) === style.variantNumber
      ) as Record<string, unknown> | undefined;

      const safe = (value: unknown, fallback: string, max: number) =>
        String(value || fallback).replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

      const tags = Array.isArray(item?.tags)
        ? item.tags.map((tag: unknown) => String(tag).trim().toLowerCase()).filter(Boolean).slice(0, 8)
        : params.articleTitle.toLowerCase().split(/[^a-z0-9]+/).filter((x) => x.length > 2).slice(0, 6);

      return {
        variantNumber: style.variantNumber,
        styleId: style.styleId,
        styleLabel: style.styleLabel,
        prompt: safe(item?.prompt, `Create a Pinterest-ready editorial image about ${params.articleTitle}. ${style.direction}`, 1800),
        pinTitle: safe(item?.pinTitle, params.articleTitle, 100),
        description: safe(item?.description, `${params.articleTitle}. Explore the full article for more ideas and details.`, 450),
        altText: safe(item?.altText, `${params.articleTitle} Pinterest visual`, 250),
        tags,
        overlayText: cleanText(item?.overlayText, params.articleTitle, 90),
        ctaText: cleanText(item?.ctaText, "READ MORE IDEAS", 32),
        footerText: cleanText(item?.footerText, domain || "", 80),
      };
    });
  } catch (err) {
    console.warn(`[gemini] AI Flow prompt generation failed; using grounded fallback prompts — ${err instanceof Error ? err.message : err}`);
    return styles.map((style) => ({
      variantNumber: style.variantNumber,
      styleId: style.styleId,
      styleLabel: style.styleLabel,
      prompt: `Create a high-end realistic Pinterest editorial visual inspired by this article: "${params.articleTitle}". Use the article's subject and practical details as visual inspiration. ${style.direction} Vertical composition for Google Flow 9:16 output. Do not invent facts. Do not render random typography, logos, watermarks, UI, or fake website elements; reserve clean space for the app to add exact readable typography after download.`,
      pinTitle: params.articleTitle,
      description: `${params.articleTitle}. Discover the details and ideas in the full article.`,
      altText: `${params.articleTitle} Pinterest visual`,
      tags: params.articleTitle.toLowerCase().split(/[^a-z0-9]+/).filter((x) => x.length > 2).slice(0, 6),
      overlayText: params.articleTitle.slice(0, 90),
      ctaText: "READ MORE IDEAS",
      footerText: domain || "",
    }));
  }
}
