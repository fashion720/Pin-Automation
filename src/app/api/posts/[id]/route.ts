import { NextRequest, NextResponse } from "next/server";
import { deletePost, getPost } from "@/lib/store";
import { deleteImagesByPublicUrls } from "@/lib/storage";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const post = await getPost(id);
  if (!post) return NextResponse.json({ error: "Post nahi mila" }, { status: 404 });

  // Delete this post's pin images from R2 first (best-effort), so bucket
  // space is freed even if it's the only thing being deleted right now.
  await deleteImagesByPublicUrls(post.pins.map((pin) => pin.imageUrl));

  await deletePost(id);
  return NextResponse.json({ ok: true, deletedPins: post.pins.length });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const post = await getPost(id);
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(post);
}
