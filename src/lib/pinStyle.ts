export type PinStyleFontFamily = "sans" | "display" | "serif";

export interface PinStyleOverrides {
  headlineFontFamily?: PinStyleFontFamily;
  headlineColor?: string;
  headlineFontSize?: number;
  headlineLineHeight?: number;
  headlineLetterSpacing?: number;
  headlineTransform?: "none" | "uppercase";
  headlineBackgroundColor?: string;
  headlineBackgroundOpacity?: number;
  headlineShadow?: boolean;
  headlineX?: number;
  headlineY?: number;
  headlineWidth?: number;
  headlineHeight?: number;
  headlineRadius?: number;
  headlineShape?: "none" | "rectangle" | "soft" | "pill";
  ctaVisible?: boolean;
  ctaText?: string;
  ctaBackgroundColor?: string;
  ctaTextColor?: string;
  ctaFontFamily?: PinStyleFontFamily;
  ctaFontSize?: number;
  ctaWidth?: number;
  ctaHeight?: number;
  ctaX?: number;
  ctaY?: number;
  ctaLetterSpacing?: number;
  footerText?: string;
  footerBackgroundColor?: string;
  footerTextColor?: string;
  footerWidth?: number;
  footerHeight?: number;
  footerY?: number;
  footerFontSize?: number;
}

export const DEFAULT_PIN_STYLE: Required<PinStyleOverrides> = {
  headlineFontFamily: "sans", headlineColor: "#ffffff", headlineFontSize: 60, headlineLineHeight: 1.04,
  headlineLetterSpacing: 0, headlineTransform: "none", headlineBackgroundColor: "#111111", headlineBackgroundOpacity: .8,
  headlineShadow: true, headlineX: 0, headlineY: 0, headlineWidth: 0, headlineHeight: 0, headlineRadius: 0, headlineShape: "rectangle",
  ctaVisible: true, ctaText: "READ MORE", ctaBackgroundColor: "#ffffff", ctaTextColor: "#111111", ctaFontFamily: "sans",
  ctaFontSize: 26, ctaWidth: 350, ctaHeight: 86, ctaX: 0, ctaY: 0, ctaLetterSpacing: 1.2, footerText: "YOUR SITE",
  footerBackgroundColor: "#111111", footerTextColor: "#ffffff", footerWidth: 320, footerHeight: 50, footerY: 1432, footerFontSize: 24,
};

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
function numberInRange(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.min(max, Math.max(min, value));
}
function colorOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && HEX_COLOR.test(value) ? value : undefined;
}

export function sanitizePinStyle(input: unknown): PinStyleOverrides {
  if (!input || typeof input !== "object") return {};
  const source = input as Record<string, unknown>;
  const output: PinStyleOverrides = {};
  const mutable = output as Record<string, unknown>;
  if (["sans", "display", "serif"].includes(String(source.headlineFontFamily))) output.headlineFontFamily = source.headlineFontFamily as PinStyleFontFamily;
  if (["sans", "display", "serif"].includes(String(source.ctaFontFamily))) output.ctaFontFamily = source.ctaFontFamily as PinStyleFontFamily;
  if (source.headlineTransform === "none" || source.headlineTransform === "uppercase") output.headlineTransform = source.headlineTransform;
  if (["none", "rectangle", "soft", "pill"].includes(String(source.headlineShape))) output.headlineShape = source.headlineShape as PinStyleOverrides["headlineShape"];
  if (typeof source.ctaVisible === "boolean") output.ctaVisible = source.ctaVisible;
  if (typeof source.headlineShadow === "boolean") output.headlineShadow = source.headlineShadow;
  for (const key of ["headlineColor", "headlineBackgroundColor", "ctaBackgroundColor", "ctaTextColor"] as Array<keyof PinStyleOverrides>) {
    const color = colorOrUndefined(source[key]);
    if (color) mutable[key] = color;
  }
  const numericRanges: Array<[keyof PinStyleOverrides, number, number]> = [
    ["headlineFontSize", 24, 150], ["headlineLineHeight", .75, 1.5], ["headlineLetterSpacing", -2, 8],
    ["headlineBackgroundOpacity", 0, 1], ["headlineX", 0, 1000], ["headlineY", 0, 1500], ["headlineWidth", 100, 1000],
    ["headlineHeight", 60, 800], ["headlineRadius", 0, 150], ["ctaFontSize", 12, 64], ["ctaWidth", 120, 700],
    ["ctaHeight", 40, 180], ["ctaX", 0, 1000], ["ctaY", 0, 1500], ["ctaLetterSpacing", -1, 6],
  ];
  for (const [key, min, max] of numericRanges) {
    const value = numberInRange(source[key], min, max);
    if (value !== undefined) mutable[key] = value;
  }
  if (typeof source.ctaText === "string") output.ctaText = source.ctaText.replace(/[\r\n]+/g, " ").trim().slice(0, 32);
  if (typeof source.footerText === "string") output.footerText = source.footerText.replace(/[\r\n]+/g, " ").trim().slice(0, 80);
  for (const key of ["footerBackgroundColor", "footerTextColor"] as Array<keyof PinStyleOverrides>) {
    const color = colorOrUndefined(source[key]);
    if (color) mutable[key] = color;
  }
  return output;
}
