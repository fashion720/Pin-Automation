import { NextRequest, NextResponse } from "next/server";
import { requireApiSecret } from "@/lib/apiAuth";
import { claimNextAIFlowJob, getAIFlowJob } from "@/lib/aiFlow";

export async function POST(req: NextRequest) {
  const authError = requireApiSecret(req);
  if (authError) return authError;
  return NextResponse.json({ job: (await claimNextAIFlowJob()) || null });
}
export async function GET(req: NextRequest) {
  const authError = requireApiSecret(req);
  if (authError) return authError;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const job = await getAIFlowJob(id);
  return job ? NextResponse.json(job) : NextResponse.json({ error: "Job not found" }, { status: 404 });
}
