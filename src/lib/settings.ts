import { readJson, writeJson } from "./kv";

export const AVAILABLE_GEMINI_MODELS = [
  { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash-Lite (newest, cheapest)" },
  { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite" },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro (slower, higher quality)" },
] as const;

export type GeminiModelId = (typeof AVAILABLE_GEMINI_MODELS)[number]["id"];

export interface AppSettings {
  geminiModel: GeminiModelId;
}

const KEY = "settings";
const DEFAULT_SETTINGS: AppSettings = { geminiModel: "gemini-2.5-flash" };

function isValidModel(value: unknown): value is GeminiModelId {
  return AVAILABLE_GEMINI_MODELS.some((m) => m.id === value);
}

export async function getSettings(): Promise<AppSettings> {
  const stored = await readJson<Partial<AppSettings>>(KEY, {});
  return {
    geminiModel: isValidModel(stored.geminiModel) ? stored.geminiModel : DEFAULT_SETTINGS.geminiModel,
  };
}

export async function updateGeminiModel(model: string): Promise<AppSettings> {
  if (!isValidModel(model)) throw new Error("Invalid Gemini model selected");
  const settings: AppSettings = { geminiModel: model };
  await writeJson(KEY, settings);
  return settings;
}
