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
  /** Optional — when set, this overrides the GEMINI_API_KEY env var. */
  geminiApiKey?: string;
}

const KEY = "settings";
const DEFAULT_SETTINGS: AppSettings = { geminiModel: "gemini-2.5-flash" };

function isValidModel(value: unknown): value is GeminiModelId {
  return AVAILABLE_GEMINI_MODELS.some((m) => m.id === value);
}

/** Full settings, including the raw API key. Server-side use only (e.g. gemini.ts) — never send this over the API. */
export async function getSettings(): Promise<AppSettings> {
  const stored = await readJson<Partial<AppSettings>>(KEY, {});
  return {
    geminiModel: isValidModel(stored.geminiModel) ? stored.geminiModel : DEFAULT_SETTINGS.geminiModel,
    geminiApiKey: stored.geminiApiKey?.trim() || undefined,
  };
}

/** Masked view safe to return from the API — never leaks the actual key. */
export function maskApiKey(key?: string): string | null {
  if (!key) return null;
  if (key.length <= 4) return "••••";
  return `••••${key.slice(-4)}`;
}

export async function updateGeminiModel(model: string): Promise<AppSettings> {
  if (!isValidModel(model)) throw new Error("Invalid Gemini model selected");
  const current = await getSettings();
  const settings: AppSettings = { ...current, geminiModel: model };
  await writeJson(KEY, settings);
  return settings;
}

export async function updateGeminiApiKey(key: string): Promise<AppSettings> {
  const current = await getSettings();
  const settings: AppSettings = { ...current, geminiApiKey: key.trim() || undefined };
  await writeJson(KEY, settings);
  return settings;
}

export async function clearGeminiApiKey(): Promise<AppSettings> {
  const current = await getSettings();
  const settings: AppSettings = { ...current, geminiApiKey: undefined };
  await writeJson(KEY, settings);
  return settings;
}
