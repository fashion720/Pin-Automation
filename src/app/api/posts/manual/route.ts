import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { addPost, Pin } from "@/lib/store";
import { resolveBatchId } from "@/lib/batches";

/**
 * Body: {
 *   title: string,
 *   articleUrl: string,          // destination link for the CSV export
 *   pins: [{ imageUrl: string, overlayText?: string, keywords?: string[] }]
 * }
 * `imageUrl` here is already a public R2 link (uploaded client-side via
 * /api/upload-presign, same as the template editor does) — this route
 * just records the post, it never touches the image bytes.
 */
export async function POST(req: NextRequest) {
  try {
    const { title, articleUrl, pins: pinInputs, batchId: requestedBatchId } = await req.json();

    if (!title?.trim()) {
      return NextResponse.json({ error: "Post ka title do" }, { status: 400 });
    }
    if (!Array.isArray(pinInputs) || pinInputs.length === 0) {
      return NextResponse.json({ error: "Kam se kam ek pin image chahiye" }, { status: 400 });
    }

    const batchId = await resolveBatchId(requestedBatchId);
    const pins: Pin[] = pinInputs.map((p: any) => ({
      id: randomUUID(),
      templateId: "manual",
      templateName: "Manual upload",
      imageUrl: p.imageUrl,
      overlayText: p.overlayText || "",
      keywords: Array.isArray(p.keywords)
        ? p.keywords
        : (p.keywords || "")
            .split(",")
            .map((k: string) => k.trim())
            .filter(Boolean),
    }));

    const post = await addPost({
      id: randomUUID(),
      title,
      articleUrl: articleUrl || "",
      createdAt: new Date().toISOString(),
      batchId,
      pins,
    });

    return NextResponse.json(post);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Save failed" }, { status: 500 });
  }
}
