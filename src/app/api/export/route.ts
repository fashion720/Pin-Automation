import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { updatePinInPost } from "@/lib/store";
import { formatPublishDate, schedulePins, type SchedulablePin } from "@/lib/schedule";
import { absoluteMediaUrl, withPinScheduleUtm, rowsToCsv, csvFilename } from "@/lib/pinterestCsv";
import { selectPins } from "@/lib/pinSelection";

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


async function buildCsv(options: ExportOptions, origin: string): Promise<{ csv: string; filename: string; count: number }> {
  const selected = await selectPins(options);
  const mode = options.mode || "claude";
  const timeZone = options.timeZone || "UTC";
  const startAt = options.startAt || new Date().toISOString();

  let exportPins: ExportPin[];
  if (mode === "claude") {
    exportPins = selected;
  } else {
    exportPins = schedulePins(selected.slice(0, 200), {
      startAt,
      sameArticleGapDays: options.sameArticleGapDays || 3,
      timeZone,
    });
    const scheduleGroupId = randomUUID();
    for (const pin of exportPins) {
      await updatePinInPost(pin.postId, pin.id, {
        scheduledAt: pin.scheduledAt,
        scheduleGroupId,
        scheduleStatus: "scheduled",
      });
    }
  }

  const includeExtended = mode === "claude" || options.includeExtended !== false;
  const rows = exportPins.map((pin, i) => {
    const tags = (pin.tags?.length ? pin.tags : pin.keywords || []).join(", ");
    const title = pin.pinTitle || pin.overlayText || pin.postTitle;
    const description = pin.description || `${pin.postTitle}. Discover more ideas in the full article.`;
    const altText = pin.altText || `${title} Pinterest pin`;
    const publishDate = mode === "pinterest" && pin.scheduledAt ? formatPublishDate(pin.scheduledAt, timeZone) : "";
    const board = mode === "pinterest" ? options.board || "" : "";
    // Numbered pin_001, pin_002... within THIS export only — every download restarts at 1.
    const link = mode === "pinterest" ? withPinScheduleUtm(pin.articleUrl, i + 1) : pin.articleUrl;

    const row: Record<string, string> = {
      Title: title,
      "Media URL": absoluteMediaUrl(pin.imageUrl, origin),
      "Pinterest board": board,
      Description: description,
      Link: link,
      "Publish date": publishDate,
    };

    if (includeExtended) {
      row["Destination Link"] = link;
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

  return { csv: rowsToCsv(rows), filename: csvFilename(mode === "claude" ? "claude-pin-data" : "pinterest-pins"), count: rows.length };
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
