import { NextRequest, NextResponse } from "next/server";
import { failAIFlowJob } from "@/lib/aiFlow";
import { requireApiSecret } from "@/lib/apiAuth";
export async function POST(req: NextRequest) {
  const authError = requireApiSecret(req);
  if (authError) return authError;
  const body = await req.json();
  const job = await failAIFlowJob(String(body.jobId || ""), String(body.error || "Flow worker failed"));
  return job ? NextResponse.json(job) : NextResponse.json({ error: "Job not found" }, { status: 404 });
}
