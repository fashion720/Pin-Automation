import { NextRequest, NextResponse } from "next/server";
import { addPost, getAllPosts, updatePost } from "@/lib/store";
import { completeAIFlowJob, refreshAIFlowRun, getAIFlowRun } from "@/lib/aiFlow";
import { requireApiSecret } from "@/lib/apiAuth";
import { markBatchPinsCreated } from "@/lib/batches";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest) {
  const authError = requireApiSecret(req);
  if (authError) return authError;
  try {
    const body = await req.json();
    const jobId = String(body.jobId || "");
    const imageUrl = String(body.imageUrl || "");
    if (!jobId || !imageUrl) return NextResponse.json({ error: "jobId aur imageUrl required hain" }, { status: 400 });

    const job = await completeAIFlowJob(jobId, imageUrl);
    if (!job) return NextResponse.json({ error: "Job nahi mila" }, { status: 404 });

    const run = await getAIFlowRun(job.runId);
    const existingPosts = await getAllPosts();
    const post = existingPosts.find((item) => item.batchId === run?.batchId && item.articleUrl === job.articleUrl);
    const aiFlowJobId = job.id;
    const pin = {
      id: randomUUID(),
      aiFlowJobId,
      templateId: `ai-flow:${job.styleId}`,
      templateName: `Google Flow · ${job.styleLabel}`,
      imageUrl,
      overlayText: job.overlayText || job.pinTitle,
      keywords: job.tags,
      pinTitle: job.pinTitle,
      description: job.description,
      altText: job.altText,
      tags: job.tags,
      scheduleStatus: "draft" as const,
    };

    if (post) {
      const alreadyAdded = post.pins.some((item) => item.aiFlowJobId === aiFlowJobId);
      if (!alreadyAdded) {
        await updatePost(post.id, { pins: [...post.pins, pin] });
      }
    } else {
      await addPost({
        id: randomUUID(),
        title: job.articleTitle,
        articleUrl: job.articleUrl,
        createdAt: new Date().toISOString(),
        batchId: run?.batchId,
        pins: [pin],
      });
    }

    if (run?.batchId) await markBatchPinsCreated(run.batchId).catch(() => {});
    return NextResponse.json({ job, run: await refreshAIFlowRun(job.runId), postCreated: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Complete failed" }, { status: 500 });
  }
}
