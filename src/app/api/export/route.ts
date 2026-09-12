import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import * as XLSX from "xlsx";
import { getAllPinsFlat, updatePinInPost } from "@/lib/store";
import { formatPublishDate, schedulePins, type SchedulablePin } from "@/lib/schedule";

interface ExportOptions {
  mode?: "claude" | "pinterest";
  batchId?: string;
  postIds?: string[];
  pinIds?: string[];
  startAt?: string;
  sameArticleGapDays?: number;
  timeZone?: string;
  board?: string;
  includeExtended?: boolean;
}

type FlatPin = SchedulablePin;

type ExportPin = FlatPin & { scheduledAt?: string };

function absoluteMediaUrl(imageUrl: string, origin: string): string {
  return imageUrl.startsWith("http") ? imageUrl : `${origin}${imageUrl}`;
}

async function buildCsv(options: ExportOptions, origin: string): Promise<{ csv: string; filename: string; count: number }> {
  const allPins = (await getAllPinsFlat()) as FlatPin[];
  if (allPins.length === 0) throw new Error("Abhi koi pin generate nahi hui");

  const batchSelected = options.batchId ? allPins.filter((pin) => pin.batchId === options.batchId) : allPins;
  const postWanted = options.postIds?.length ? new Set(options.postIds) : null;
  const postSelected = postWanted ? batchSelected.filter((pin) => postWanted.has(pin.postId)) : batchSelected;
  const wanted = options.pinIds?.length ? new Set(options.pinIds) : null;
  const selected = wanted ? postSelected.filter((pin) => wanted.has(pin.id)) : postSelected;
  if (selected.length === 0) throw new Error("Selected pins nahi mile");

  const mode = options.mode || "claude";
  const exportPins: ExportPin[] = mode === "claude"
    ? selected
    : schedulePins(selected.slice(0, 200), {
        startAt: options.startAt || new Date().toISOString(),
        sameArticleGapDays: options.sameArticleGapDays || 3,
        timeZone: options.timeZone || "UTC",
      });

  const timeZone = options.timeZone || "UTC";
  const scheduleGroupId = mode === "pinterest" ? randomUUID() : undefined;
  if (mode === "pinterest") {
    for (const pin of exportPins) {
      await updatePinInPost(pin.postId, pin.id, {
        scheduledAt: pin.scheduledAt,
        scheduleGroupId,
        scheduleStatus: "scheduled",
      });
    }
  }

  const includeExtended = mode === "claude" || options.includeExtended !== false;
  const rows = exportPins.map((pin) => {
    const tags = (pin.tags?.length ? pin.tags : pin.keywords || []).join(", ");
    const title = pin.pinTitle || pin.overlayText || pin.postTitle;
    const description = pin.description || `${pin.postTitle}. Discover more ideas in the full article.`;
    const altText = pin.altText || `${title} Pinterest pin`;
    const publishDate = mode === "pinterest" && pin.scheduledAt
      ? formatPublishDate(pin.scheduledAt, timeZone)
      : "";

    const row: Record<string, string> = {
      Title: title,
      "Media URL": absoluteMediaUrl(pin.imageUrl, origin),
      "Pinterest board": mode === "pinterest" ? options.board || "" : "",
      Description: description,
      Link: pin.articleUrl,
      "Publish date": publishDate,
    };

    if (includeExtended) {
      row["Destination Link"] = pin.articleUrl;
      row.Tags = tags;
      row["Alt text"] = altText;
      row["Overlay text"] = pin.overlayText || "";
      row.Template = pin.templateName || "";
      row["Article title"] = pin.postTitle;
      row["Article URL"] = pin.articleUrl;
      row["Source image URLs"] = (pin.sourceImageUrls || []).join(" | ");
      row["Schedule status"] = mode === "pinterest" ? "scheduled" : "";
      row.Timezone = mode === "pinterest" ? timeZone : "";
      row["Pin ID"] = pin.id;
      row["Post ID"] = pin.postId;
      row["Style overrides"] = pin.styleOverrides ? JSON.stringify(pin.styleOverrides) : "";
    }
    return row;
  });

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const csv = `\ufeff${XLSX.utils.sheet_to_csv(worksheet)}`;
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = mode === "claude" ? `claude-pin-data-${stamp}.csv` : `pinterest-pins-${stamp}.csv`;
  return { csv, filename, count: rows.length };
}

function csvResponse(result: { csv: string; filename: string; count: number }) {
  return new NextResponse(result.csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${result.filename}"`,
      "X-Pin-Count": String(result.count),
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const options = (await req.json()) as ExportOptions;
    return csvResponse(await buildCsv(options, req.nextUrl.origin));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Export failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** The top-nav export is intentionally the data-rich, unscheduled Claude CSV. */
export async function GET(req: NextRequest) {
  try {
    const batchId = req.nextUrl.searchParams.get("batchId") || undefined;
    const postIds = req.nextUrl.searchParams.get("postIds")?.split(",").map((value) => value.trim()).filter(Boolean);
    return csvResponse(await buildCsv({ mode: "claude", includeExtended: true, batchId, postIds }, req.nextUrl.origin));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Export failed";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
