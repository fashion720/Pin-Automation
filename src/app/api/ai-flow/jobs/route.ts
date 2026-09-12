import { NextRequest, NextResponse } from "next/server";
import { scrapeArticle } from "@/lib/scrape";
import { suggestAIPinPrompts } from "@/lib/gemini";
import { getSettings } from "@/lib/settings";
import { createAIFlowRun, listAIFlowJobs, getAIFlowRuns, getAIFlowRun } from "@/lib/aiFlow";
import { resolveBatchId } from "@/lib/batches";
import { requireApiSecret } from "@/lib/apiAuth";

const STYLES = [
  { id: "single-image", label: "Single Image", direction: "Hero subject fills the frame; keep the main subject prominent and visually rich. No typography is required in the final composition." },
  { id: "bottom-banner", label: "Single Image + Bottom Banner", direction: "Keep the lower third visually calm for a clean editorial headline banner. Final pin must include the article-specific headline, a short CTA button, and a small website footer." },
  { id: "big-text-overlay", label: "Big Text Overlay", direction: "Leave a strong clean area around the subject for a large article-specific headline, plus a small CTA/footer treatment in the final pin." },
  { id: "top-bottom", label: "Top + Bottom Composition", direction: "Create two strong visual zones with a clean central reading area; final pin should carry a headline, CTA, and small website footer." },
  { id: "centre", label: "Centre Composition", direction: "Place the main subject centrally with calm surrounding space; final pin should carry a readable headline, short CTA, and small website footer." },
  { id: "collage-3", label: "3-Scene Editorial Collage", direction: "Create one cohesive concept with three distinct visual moments; final pin should carry a readable headline plus compact CTA/footer without obscuring the scenes." },
  { id: "collage-4", label: "4-Scene Moodboard", direction: "Create a cohesive moodboard concept with four distinct visual moments related to the article, not repeated copies; final pin should carry a readable headline plus compact CTA/footer." },
];

export async function GET(req: NextRequest) {
  const authError = requireApiSecret(req);
  if (authError) return authError;
  const { searchParams } = new URL(req.url);
  const runId = searchParams.get("runId");
  if (runId) return NextResponse.json({ run: await getAIFlowRun(runId), jobs: await listAIFlowJobs(runId) });
  return NextResponse.json(await getAIFlowRuns());
}

export async function POST(req: NextRequest) {
  const authError = requireApiSecret(req);
  if (authError) return authError;
  try {
    const body = await req.json();
    const urls = Array.from(new Set(String(body.articleUrls || "").split(/[\n,]+/).map((value) => value.trim()).filter(Boolean))) as string[];
    const pinsPerArticle = Math.max(1, Math.min(10, Number(body.pinsPerArticle) || 1));
    const requestedStyles = Array.isArray(body.styleIds) ? body.styleIds.map(String) : [];
    const selectedStyles = STYLES.filter((style) => requestedStyles.includes(style.id));
    if (!urls.length) return NextResponse.json({ error: "Kam se kam ek article URL daalo." }, { status: 400 });
    if (urls.length > 50) return NextResponse.json({ error: "Maximum 50 article URLs allowed hain." }, { status: 400 });
    if (!selectedStyles.length) return NextResponse.json({ error: "Kam se kam ek AI style select karo." }, { status: 400 });

    const batchId = body.batchId ? await resolveBatchId(body.batchId) : undefined;
    const { geminiModel } = await getSettings();
    const planned = [];
    const preparationErrors: string[] = [];

    for (const articleUrl of urls) {
      try {
        const article = await scrapeArticle(articleUrl);
        const prompts = await suggestAIPinPrompts({
          articleTitle: article.title,
          articleContent: article.contentText,
          articleUrl: article.url,
          styles: selectedStyles,
          pinsPerArticle,
          model: geminiModel,
        });
        for (const item of prompts) {
          planned.push({
          articleId: article.url,
          articleUrl: article.url,
          articleTitle: article.title,
          styleId: item.styleId,
          styleLabel: item.styleLabel,
          prompt: `${item.prompt}\n\nFINAL PIN TYPOGRAPHY SPEC: Headline: "${item.overlayText}". CTA button: "${item.ctaText}". Footer: "${item.footerText}". Keep the composition clean and leave the requested safe area clear; the app will composite this exact typography after the Flow download for crisp readable text.`,
          pinTitle: item.pinTitle,
          description: item.description,
          altText: item.altText,
          tags: item.tags,
          overlayText: item.overlayText,
          ctaText: item.ctaText,
          footerText: item.footerText,
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        preparationErrors.push(`${articleUrl}: ${message}`);
      }
    }

    if (!planned.length) {
      return NextResponse.json({ error: `Kisi bhi article ke liye AI jobs prepare nahi ho sakin.\n${preparationErrors.join("\n")}` }, { status: 502 });
    }

    const runName = String(body.name || `Google Flow AI · ${new Date().toLocaleDateString("en-US")}`).slice(0, 100);
    const result = await createAIFlowRun({ name: runName, batchId, jobs: planned });
    return NextResponse.json({ ...result, preparationErrors });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "AI Flow run create nahi hua" }, { status: 500 });
  }
}
