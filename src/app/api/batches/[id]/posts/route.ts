import { NextRequest, NextResponse } from "next/server";
import { getBatch } from "@/lib/batches";
import { deletePosts, movePostsToBatch, getPostsByBatchId } from "@/lib/store";
import { deleteImagesByPublicUrls } from "@/lib/storage";

interface BulkActionBody {
  action?: "delete" | "move";
  postIds?: string[];
  targetBatchId?: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sourceBatchId } = await params;
    const sourceBatch = await getBatch(sourceBatchId);
    if (!sourceBatch) return NextResponse.json({ error: "Source batch nahi mila" }, { status: 404 });

    const body = (await req.json()) as BulkActionBody;
    const postIds = Array.isArray(body.postIds) ? [...new Set(body.postIds.filter(Boolean))] : [];
    if (!postIds.length) return NextResponse.json({ error: "Kam se kam ek post select karo" }, { status: 400 });

    if (body.action === "delete") {
      const wanted = new Set(postIds);
      const posts = (await getPostsByBatchId(sourceBatchId)).filter((post) => wanted.has(post.id));
      await deleteImagesByPublicUrls(posts.flatMap((post) => post.pins.map((pin) => pin.imageUrl)));
      const count = await deletePosts(postIds, sourceBatchId);
      return NextResponse.json({ ok: true, action: "delete", count });
    }

    if (body.action === "move") {
      if (!body.targetBatchId) return NextResponse.json({ error: "Target batch select karo" }, { status: 400 });
      if (body.targetBatchId === sourceBatchId) return NextResponse.json({ error: "Target batch different hona chahiye" }, { status: 400 });
      const targetBatch = await getBatch(body.targetBatchId);
      if (!targetBatch) return NextResponse.json({ error: "Target batch nahi mila" }, { status: 404 });
      const count = await movePostsToBatch(postIds, targetBatch.id, sourceBatchId);
      return NextResponse.json({ ok: true, action: "move", count, targetBatch });
    }

    return NextResponse.json({ error: "Unknown bulk action" }, { status: 400 });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Bulk action fail ho gaya" }, { status: 500 });
  }
}
