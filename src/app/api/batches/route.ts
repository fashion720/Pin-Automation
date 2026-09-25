import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { addBatch, getAllBatches } from "@/lib/batches";
import { getAllPosts, updatePost } from "@/lib/store";

export async function GET() {
  try {
    let batches = await getAllBatches();
    let posts = await getAllPosts();
    let batchOne = batches.find((batch) => batch.name === "Batch 1");
    if (!batchOne) {
      const now = new Date().toISOString();
      batchOne = await addBatch({
        id: randomUUID(),
        name: "Batch 1",
        accountLabel: "First account/category",
        description: "Default folder for existing posts. Create another batch for a separate Pinterest account or category.",
        createdAt: now,
        updatedAt: now,
        status: "pending",
      });
      batches = [batchOne, ...batches];
    }
    const unsortedId = batches.find((batch) => batch.name === "Unsorted")?.id;
    const legacyPosts = posts.filter((post) => !post.batchId || post.batchId === unsortedId);
    if (legacyPosts.length) {
      for (const post of legacyPosts) await updatePost(post.id, { batchId: batchOne!.id });
      posts = posts.map((post) => legacyPosts.some((legacy) => legacy.id === post.id) ? { ...post, batchId: batchOne!.id } : post);
    }
    return NextResponse.json(
      batches.map((batch) => {
        const batchPosts = posts.filter((post) => post.batchId === batch.id);
        return {
          ...batch,
          postCount: batchPosts.length,
          pinCount: batchPosts.reduce((count, post) => count + post.pins.length, 0),
        };
      })
    );
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Batches load nahi huay" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { name?: string; accountLabel?: string; description?: string };
    const name = body.name?.trim();
    if (!name) return NextResponse.json({ error: "Batch ka naam do" }, { status: 400 });
    const now = new Date().toISOString();
    const batch = await addBatch({
      id: randomUUID(),
      name: name.slice(0, 80),
      accountLabel: body.accountLabel?.trim().slice(0, 80),
      description: body.description?.trim().slice(0, 240),
      createdAt: now,
      updatedAt: now,
      status: "pending",
    });
    return NextResponse.json(batch, { status: 201 });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Batch create nahi hua" }, { status: 500 });
  }
}
