import { NextRequest, NextResponse } from "next/server";
import {
  AVAILABLE_GEMINI_MODELS,
  clearGeminiApiKey,
  getSettings,
  maskApiKey,
  updateGeminiApiKey,
  updateGeminiModel,
} from "@/lib/settings";
import { requireApiSecret } from "@/lib/apiAuth";

export async function GET() {
  try {
    const settings = await getSettings();
    // Never return the raw key — only whether one is set, and a masked preview.
    return NextResponse.json({
      geminiModel: settings.geminiModel,
      geminiApiKeySet: Boolean(settings.geminiApiKey),
      geminiApiKeyMasked: maskApiKey(settings.geminiApiKey),
      availableModels: AVAILABLE_GEMINI_MODELS,
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Settings load nahi huay" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const authError = requireApiSecret(req);
  if (authError) return authError;

  try {
    const body = (await req.json().catch(() => ({}))) as { geminiModel?: string; geminiApiKey?: string };
    if (!body.geminiModel && body.geminiApiKey === undefined) {
      return NextResponse.json({ error: "geminiModel ya geminiApiKey do" }, { status: 400 });
    }

    if (body.geminiModel) await updateGeminiModel(body.geminiModel);

    if (body.geminiApiKey !== undefined) {
      const trimmed = body.geminiApiKey.trim();
      await (trimmed ? updateGeminiApiKey(trimmed) : clearGeminiApiKey());
    }

    const settings = await getSettings();
    return NextResponse.json({
      geminiModel: settings.geminiModel,
      geminiApiKeySet: Boolean(settings.geminiApiKey),
      geminiApiKeyMasked: maskApiKey(settings.geminiApiKey),
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Settings update nahi huay" }, { status: 500 });
  }
}
