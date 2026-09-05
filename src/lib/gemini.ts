import { GoogleGenerativeAI } from "@google/generative-ai";

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

function getClient() {
  if (!client) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY missing — add it to your .env.local file");
    client = new GoogleGenerativeAI(key);
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

/**
 * Generates a distinct visual overlay and complete Pinterest metadata for each
 * selected design in one structured request.
 */
export async function suggestOverlays(params: {
  articleTitle: string;
  userKeywords?: string;
  userAnnotations?: string;
  briefs: OverlayBrief[];
  model?: string;
}): Promise<Map<number, OverlaySuggestion>> {
  const resultMap = new Map<number, OverlaySuggestion>();
  const model = getClient().getGenerativeModel({
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

${briefText}

Rules for every variant:
- overlayText: 4-8 words, maximum 70 characters, written as a strong article-specific Pinterest hook. Prefer a promise, curiosity gap, number, transformation, or specific benefit from the supplied article. No hashtags, emojis, quotation marks, or generic CTA language. Never use filler such as “See the ideas”, “Read more”, or “Amazing tips”.
- pinTitle: natural, specific Pinterest title, maximum 100 characters, different enough from other variants to avoid duplicates.
- description: useful Pinterest description, 1-2 sentences, maximum 450 characters. Include relevant search terms naturally, but do not keyword-stuff.
- altText: factual accessibility description of the pin’s visual/article subject, maximum 250 characters. Do not say “image of” repeatedly and do not describe text that is not supplied.
- tags: 3-8 short lowercase keyword phrases that are relevant to the article. Use the same core tags when appropriate, with a few variant-specific tags.
- Match tone to the listed design: refined for serif, punchy for condensed display, practical for warm clean layouts. Every variant must remain faithful to the article topic and use different wording/photo angle when the supplied context supports it.

Return ONLY valid JSON in exactly this shape:
{"variants":[{"variantNumber":1,"overlayText":"short phrase","pinTitle":"Pinterest title","description":"Pinterest description","altText":"Accessible visual description","tags":["tag1","tag2","tag3"]}]}`;

  const response = await model.generateContent(prompt);
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
