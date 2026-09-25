import * as XLSX from "xlsx";

export function absoluteMediaUrl(imageUrl: string, origin: string): string {
  return imageUrl.startsWith("http") ? imageUrl : `${origin}${imageUrl}`;
}

/**
 * Appends the pin_schedule UTM params, numbered pin_001, pin_002... within
 * THIS export only — every export/download restarts numbering at 1.
 */
export function withPinScheduleUtm(articleUrl: string, pinNumber: number): string {
  try {
    const url = new URL(articleUrl);
    url.searchParams.set("utm_source", "pinterest");
    url.searchParams.set("utm_medium", "social");
    url.searchParams.set("utm_campaign", "pin_schedule");
    url.searchParams.set("utm_content", `pin_${String(pinNumber).padStart(3, "0")}`);
    return url.toString();
  } catch {
    return articleUrl; // not a valid absolute URL — leave untouched rather than throw
  }
}

export function rowsToCsv(rows: Record<string, string>[]): string {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  return `\ufeff${XLSX.utils.sheet_to_csv(worksheet)}`;
}

export function csvFilename(prefix: string): string {
  return `${prefix}-${new Date().toISOString().slice(0, 10)}.csv`;
}
