import { NextRequest, NextResponse } from "next/server";
import { AVAILABLE_GEMINI_MODELS, getSettings, updateGeminiModel } from "@/lib/settings";
import { requireApiSecret } from "@/lib/apiAuth";

export async function GET() {
  try {
    const settings = await getSettings();
    return NextResponse.json({ ...settings, availableModels: AVAILABLE_GEMINI_MODELS });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Settings load nahi huay" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const authError = requireApiSecret(req);
  if (authError) return authError;

  try {
    const body = (await req.json().catch(() => ({}))) as { geminiModel?: string };
    if (!body.geminiModel) return NextResponse.json({ error: "geminiModel required" }, { status: 400 });
    const updated = await updateGeminiModel(body.geminiModel);
    return NextResponse.json(updated);
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Settings update nahi huay" }, { status: 500 });
  }
}
