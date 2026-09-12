import { NextRequest, NextResponse } from "next/server";
import { retryAIFlowJob } from "@/lib/aiFlow";
import { requireApiSecret } from "@/lib/apiAuth";
export async function POST(req: NextRequest) {
  const authError = requireApiSecret(req);
  if (authError) return authError;
  const body = await req.json();
  const job = await retryAIFlowJob(String(body.jobId || ""));
  return job ? NextResponse.json(job) : NextResponse.json({ error: "Job not found" }, { status: 404 });
}
