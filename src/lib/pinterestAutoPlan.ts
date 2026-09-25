import type { SchedulablePin } from "./schedule";
import { scheduleByDay, resolveSlotDate } from "./daySchedule";
import { assignBoards } from "./boardAssign";
import type { PinterestAccount } from "./accounts";

export interface PlanPin {
  pinId: string;
  postId: string;
  title: string;
  imageUrl: string;
  articleUrl: string;
  description: string;
  dayOffset: number;
  dayDate: string; // YYYY-MM-DD in the given time zone
  scheduledAt: string; // ISO instant
  boardName: string;
  isNewBoard: boolean;
}

export interface NewBoardProposal {
  name: string;
  description: string;
  pinCount: number;
}

export interface DaySummary {
  dayOffset: number;
  date: string;
  pinCount: number;
}

export interface RepeatWarning {
  date: string;
  articleUrl: string;
  count: number;
}

export interface PinterestAutoPlan {
  pins: PlanPin[];
  newBoards: NewBoardProposal[];
  days: DaySummary[];
  repeats: RepeatWarning[];
}

function dayDateLabel(startAt: string, timeZone: string, dayOffset: number): string {
  const date = resolveSlotDate(startAt, timeZone, dayOffset, "00:00");
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export async function buildPlan(
  pins: SchedulablePin[],
  account: PinterestAccount,
  opts: { pinsPerDay: number; startAt: string; timeZone: string; model?: string }
): Promise<PinterestAutoPlan> {
  const capped = pins.slice(0, 500);

  // 1) Schedule into consecutive days, no day gaps, same URL avoided within a day wherever possible.
  const slots = scheduleByDay(
    capped.map((pin) => ({ key: pin.articleUrl || pin.postId })),
    { pinsPerDay: opts.pinsPerDay, startAt: opts.startAt, timeZone: opts.timeZone }
  );

  // 2) Ask Gemini to assign the best-fit board per pin (or propose a new one).
  const assignments = await assignBoards(
    capped.map((pin, i) => ({
      pinIndex: i,
      title: pin.pinTitle || pin.overlayText || pin.postTitle,
      description: pin.description || pin.postTitle,
    })),
    account.boards,
    opts.model
  );
  const assignmentByIndex = new Map(assignments.map((a) => [a.pinIndex, a]));

  const newBoardsMap = new Map<string, NewBoardProposal>();
  const planPins: PlanPin[] = capped.map((pin, i) => {
    const slot = slots[i];
    const scheduledAt = resolveSlotDate(opts.startAt, opts.timeZone, slot.dayOffset, slot.timeOfDay).toISOString();
    const assignment = assignmentByIndex.get(i);
    const boardName = assignment?.boardName || account.boards[0]?.name || "General";
    const isNewBoard = Boolean(assignment?.newBoard);
    if (assignment?.newBoard) {
      const key = assignment.newBoard.name.toLowerCase();
      const existing = newBoardsMap.get(key);
      if (existing) existing.pinCount += 1;
      else newBoardsMap.set(key, { name: assignment.newBoard.name, description: assignment.newBoard.description, pinCount: 1 });
    }
    return {
      pinId: pin.id,
      postId: pin.postId,
      title: pin.pinTitle || pin.overlayText || pin.postTitle,
      imageUrl: pin.imageUrl,
      articleUrl: pin.articleUrl,
      description: pin.description || pin.postTitle,
      dayOffset: slot.dayOffset,
      dayDate: dayDateLabel(opts.startAt, opts.timeZone, slot.dayOffset),
      scheduledAt,
      boardName,
      isNewBoard,
    };
  });

  // Day-by-day pin counts.
  const dayMap = new Map<number, DaySummary>();
  for (const p of planPins) {
    const existing = dayMap.get(p.dayOffset);
    if (existing) existing.pinCount += 1;
    else dayMap.set(p.dayOffset, { dayOffset: p.dayOffset, date: p.dayDate, pinCount: 1 });
  }
  const days = Array.from(dayMap.values()).sort((a, b) => a.dayOffset - b.dayOffset);

  // Same-URL-same-day repeats (worst case, when unavoidable).
  const repeatKey = new Map<string, { date: string; articleUrl: string; count: number }>();
  for (const p of planPins) {
    const key = `${p.dayDate}\u0000${p.articleUrl}`;
    const existing = repeatKey.get(key);
    if (existing) existing.count += 1;
    else repeatKey.set(key, { date: p.dayDate, articleUrl: p.articleUrl, count: 1 });
  }
  const repeats: RepeatWarning[] = Array.from(repeatKey.values())
    .filter((r) => r.count > 1)
    .sort((a, b) => a.date.localeCompare(b.date));

  return { pins: planPins, newBoards: Array.from(newBoardsMap.values()), days, repeats };
}
