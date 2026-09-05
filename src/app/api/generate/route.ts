import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { scrapeArticle } from "@/lib/scrape";
import { suggestOverlays } from "@/lib/gemini";
import { getTemplateById, TEMPLATES } from "@/lib/templates";
import { composePin } from "@/lib/compose";
import { saveGeneratedImage } from "@/lib/storage";
import { addPost, Pin } from "@/lib/store";
import { resolveBatchId } from "@/lib/batches";
import { getAutomaticStyleOverrides, rotateLayoutIds } from "@/lib/visualRotation";
import { requireApiSecret } from "@/lib/apiAuth";
import { getSettings } from "@/lib/settings";

interface GenerateBody {
  articleUrl: string;
  keywords?: string;
  annotations?: string;
  /** Optional subset. When omitted, all built-in reference-style designs run. */
  layoutIds?: string[];
  batchId?: string;
  siteText?: string;
}

const DEFAULT_LAYOUT_IDS = TEMPLATES.map((template) => template.id);

export async function POST(req: NextRequest) {
  const authError = requireApiSecret(req);
  if (authError) return authError;

  try {
    const body: GenerateBody = await req.json();
    const { articleUrl, keywords, annotations } = body;
    const siteText = body.siteText?.replace(/[\r\n]+/g, " ").trim().slice(0, 80) || "YOUR SITE";
    const batchId = await resolveBatchId(body.batchId);
    const requestedLayoutIds = body.layoutIds?.filter(Boolean);
    const rawLayoutIds = requestedLayoutIds?.length ? requestedLayoutIds : DEFAULT_LAYOUT_IDS;

    if (!articleUrl?.trim()) {
      return NextResponse.json({ error: "Article URL daalo pehle" }, { status: 400 });
    }

    const article = await scrapeArticle(articleUrl.trim());
    if (article.images.length === 0) {
      return NextResponse.json({ error: "Article mein usable images nahi mili" }, { status: 422 });
    }

    const postId = randomUUID();
    const pins: Pin[] = [];
    // Rotate the selected sequence per article URL so bulk batches do not all
    // begin with the same visual treatment. The rotation is deterministic.
    const layoutIds = rotateLayoutIds(rawLayoutIds, article.url || articleUrl.trim());
    let cursor = 0;

    const nextImages = (count: number) => {
      const picked: string[] = [];
      for (let i = 0; i < count; i++) {
        picked.push(article.images[cursor % article.images.length].src);
        cursor++;
      }
      return picked;
    };

    const generationPlan: Array<{
      index: number;
      layoutId: string;
      template: Awaited<ReturnType<typeof getTemplateById>>;
      imageUrls: string[];
      seedImage: (typeof article.images)[number] | undefined;
    }> = [];

    for (let index = 0; index < layoutIds.length; index++) {
      const layoutId = layoutIds[index];
      const template = await getTemplateById(layoutId);
      const imageUrls = nextImages(template.imageCount);
      const seedIndex = (cursor - template.imageCount) % article.images.length;
      generationPlan.push({
        index,
        layoutId,
        template,
        imageUrls,
        seedImage: article.images[seedIndex],
      });
    }

    const { geminiModel } = await getSettings();
    const overlays = await suggestOverlays({
      articleTitle: article.title,
      userKeywords: keywords,
      userAnnotations: annotations,
      model: geminiModel,
      briefs: generationPlan.map(({ index, template, seedImage }) => ({
        variantNumber: index + 1,
        layoutName: template.name,
        designBrief: template.designBrief,
        sourceHeading: seedImage?.heading || article.title,
        sourceContext: seedImage?.context || seedImage?.alt || "",
      })),
    });

    for (const { index, layoutId, template, imageUrls } of generationPlan) {
      const overlay = overlays.get(index + 1) || {
        overlayText: article.title,
        keywords: [],
        pinTitle: article.title,
        description: article.title,
        altText: `${article.title} Pinterest pin`,
        tags: [],
      };
      const styleOverrides = getAutomaticStyleOverrides(template, article.url || articleUrl.trim(), index);
      const pinBuffer = await composePin(template, imageUrls, overlay.overlayText, { ...styleOverrides, footerText: siteText });
      const filename = `${postId}-${layoutId}.png`;
      const imageUrl = await saveGeneratedImage(pinBuffer, filename);

      pins.push({
        id: randomUUID(),
        templateId: template.id,
        templateName: template.name,
        imageUrl,
        overlayText: overlay.overlayText,
        keywords: overlay.keywords,
        pinTitle: overlay.pinTitle,
        description: overlay.description,
        altText: overlay.altText,
        tags: overlay.tags,
        scheduleStatus: "draft",
        sourceImageUrls: imageUrls,
        sourceArticleUrl: article.url,
        styleOverrides,
      });
    }

    const post = await addPost({
      id: postId,
      title: article.title,
      articleUrl: article.url,
      createdAt: new Date().toISOString(),
      batchId,
      pins,
    });

    return NextResponse.json(post);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Generate failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
