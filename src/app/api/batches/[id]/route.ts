import { NextResponse } from "next/server";
import { deleteBatch, getBatch, updateBatchStatus, updateBatchNotes } from "@/lib/batches";
import { deletePosts, getPostsByBatchId } from "@/lib/store";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const batch = await getBatch(id);
    if (!batch) return NextResponse.json({ error: "Batch nahi mila" }, { status: 404 });
    const body = (await req.json().catch(() => ({}))) as { status?: string; notes?: string };

    if (body.notes !== undefined) {
      const updated = await updateBatchNotes(id, body.notes.slice(0, 2000));
      return NextResponse.json(updated);
    }

    if (body.status !== "pins_created") return NextResponse.json({ error: "Status sirf Pins Created ho sakta hai" }, { status: 400 });
    const updated = await updateBatchStatus(id, "pins_created");
    return NextResponse.json(updated);
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Batch status update nahi hua" }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const batch = await getBatch(id);
    if (!batch) return NextResponse.json({ error: "Batch nahi mila" }, { status: 404 });
    const posts = await getPostsByBatchId(id);
    const deletedPosts = await deletePosts(posts.map((post) => post.id), id);
    await deleteBatch(id);
    return NextResponse.json({ ok: true, deletedPosts, deletedPins: posts.reduce((count, post) => count + post.pins.length, 0) });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Batch delete nahi hua" }, { status: 500 });
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const batch = await getBatch(id);
    if (!batch) return NextResponse.json({ error: "Batch nahi mila" }, { status: 404 });
    const posts = await getPostsByBatchId(id);
    return NextResponse.json({
      batch,
      posts,
      postCount: posts.length,
      pinCount: posts.reduce((count, post) => count + post.pins.length, 0),
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Batch load nahi hua" }, { status: 500 });
  }
}
