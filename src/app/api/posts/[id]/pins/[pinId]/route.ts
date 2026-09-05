import { NextRequest, NextResponse } from "next/server";
import { getPost, updatePinInPost, removePinFromPost } from "@/lib/store";
import { getTemplateById } from "@/lib/templates";
import { composePin } from "@/lib/compose";
import { sanitizePinStyle } from "@/lib/pinStyle";
import { saveGeneratedImage, deleteByPublicUrl } from "@/lib/storage";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; pinId: string }> }
) {
  try {
    const { id, pinId } = await params;
    const body = await req.json();
    const { overlayText, keywords } = body;

    const post = await getPost(id);
    if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });
    const pin = post.pins.find((p) => p.id === pinId);
    if (!pin) return NextResponse.json({ error: "Pin not found" }, { status: 404 });

    const updates: Record<string, unknown> = {};
    if (keywords !== undefined) {
      updates.keywords = Array.isArray(keywords)
        ? keywords.map((keyword) => String(keyword).trim()).filter(Boolean).slice(0, 12)
        : String(keywords).split(",").map((keyword) => keyword.trim()).filter(Boolean).slice(0, 12);
    }

    const nextStyle = body.styleOverrides !== undefined
      ? { ...(pin.styleOverrides || {}), ...sanitizePinStyle(body.styleOverrides) }
      : pin.styleOverrides;
    if (body.styleOverrides !== undefined) updates.styleOverrides = nextStyle;

    const nextOverlayText = overlayText !== undefined ? String(overlayText).trim().slice(0, 160) : pin.overlayText;
    if (overlayText !== undefined) updates.overlayText = nextOverlayText;

    if (
      pin.sourceImageUrls?.length &&
      pin.templateId !== "manual" &&
      (overlayText !== undefined || body.styleOverrides !== undefined)
    ) {
      const template = await getTemplateById(pin.templateId);
      const buffer = await composePin(template, pin.sourceImageUrls, nextOverlayText, nextStyle || {});
      const filename = `${id}-${pinId}-${Date.now()}.png`;
      updates.imageUrl = await saveGeneratedImage(buffer, filename);

      // Old generated objects are best-effort deleted after the new version is saved.
      try {
        await deleteByPublicUrl(pin.imageUrl);
      } catch {
        // Non-fatal: the new image and metadata remain usable.
      }
    }

    const updatedPost = await updatePinInPost(id, pinId, updates);
    return NextResponse.json(updatedPost);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Update failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; pinId: string }> }
) {
  try {
    const { id, pinId } = await params;
    const post = await getPost(id);
    const pin = post?.pins.find((p) => p.id === pinId);
    if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });
    if (!pin) return NextResponse.json({ error: "Pin not found" }, { status: 404 });


    if (pin) {
      try {
        await deleteByPublicUrl(pin.imageUrl);
      } catch {
        // Non-fatal — still remove it from the post even if R2 delete failed.
      }
    }

    const updatedPost = await removePinFromPost(id, pinId);
    return NextResponse.json(updatedPost);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
