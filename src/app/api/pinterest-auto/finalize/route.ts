import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getAllPinsFlat, updatePinInPost } from "@/lib/store";
import { formatPublishDate, type SchedulablePin } from "@/lib/schedule";
import { absoluteMediaUrl, withPinScheduleUtm, rowsToCsv, csvFilename } from "@/lib/pinterestCsv";
import { addBoardToAccount } from "@/lib/accounts";

interface FinalizePinInput {
  pinId: string;
  boardName: string;
  scheduledAt: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { accountId, timeZone, newBoards, pins } = body as {
      accountId: string;
      timeZone?: string;
      newBoards: { name: string; description: string }[];
      pins: FinalizePinInput[];
    };
    if (!accountId) throw new Error("Account chahiye");
    if (!pins?.length) throw new Error("Koi pins nahi mile approve karne ko");

    // 1) Approved new boards go into the account's board dictionary — only these,
    //    exactly as the user (possibly edited and) approved them.
    for (const nb of newBoards || []) {
      if (nb.name?.trim()) await addBoardToAccount(accountId, { name: nb.name, description: nb.description || "" });
    }

    // 2) Re-fetch canonical pin data server-side (title/image/description/link)
    //    rather than trusting it from the client — only board + schedule come
    //    from the approved plan.
    const wantedIds = new Set(pins.map((p) => p.pinId));
    const allPins = (await getAllPinsFlat()) as SchedulablePin[];
    const byId = new Map(allPins.filter((p) => wantedIds.has(p.id)).map((p) => [p.id, p]));

    const timeZoneFinal = timeZone || "UTC";
    const scheduleGroupId = randomUUID();
    const rows: Record<string, string>[] = [];
    let i = 0;
    for (const input of pins) {
      const pin = byId.get(input.pinId);
      if (!pin) continue;
      i += 1;
      const title = pin.pinTitle || pin.overlayText || pin.postTitle;
      const description = pin.description || `${pin.postTitle}. Discover more ideas in the full article.`;
      const link = withPinScheduleUtm(pin.articleUrl, i);
      rows.push({
        Title: title,
        "Media URL": absoluteMediaUrl(pin.imageUrl, req.nextUrl.origin),
        "Pinterest board": input.boardName,
        Description: description,
        Link: link,
        "Publish date": formatPublishDate(input.scheduledAt, timeZoneFinal),
      });

      await updatePinInPost(pin.postId, pin.id, {
        scheduledAt: input.scheduledAt,
        scheduleGroupId,
        scheduleStatus: "scheduled",
      });
    }

    const csv = rowsToCsv(rows);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${csvFilename("pinterest-pins")}"`,
        "X-Pin-Count": String(rows.length),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Finalize karne mein masla hua";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
