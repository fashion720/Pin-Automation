import type { Pin } from "./store";

export interface SchedulablePin extends Pin {
  postId: string;
  batchId?: string;
  postTitle: string;
  articleUrl: string;
  createdAt: string;
}

export interface ScheduleOptions {
  startAt: string;
  sameArticleGapDays: number;
  timeZone?: string;
}

export interface ScheduledPin extends SchedulablePin {
  scheduledAt: string;
}

export function schedulePins(pins: SchedulablePin[], options: ScheduleOptions): ScheduledPin[] {
  const start = new Date(options.startAt);
  if (Number.isNaN(start.getTime())) throw new Error("Start date/time valid nahi hai");

  const gapDays = Math.max(1, Math.min(30, Math.round(options.sameArticleGapDays || 3)));
  const groups = new Map<string, SchedulablePin[]>();
  for (const pin of pins) {
    const key = pin.articleUrl || pin.postId;
    const group = groups.get(key) || [];
    group.push(pin);
    groups.set(key, group);
  }

  const scheduled: ScheduledPin[] = [];
  const maxPinsInGroup = Math.max(...Array.from(groups.values()).map((group) => group.length), 0);
  for (let slot = 0; slot < maxPinsInGroup; slot++) {
    for (const group of groups.values()) {
      const pin = group[slot];
      if (!pin) continue;
      const date = new Date(start.getTime() + slot * gapDays * 24 * 60 * 60 * 1000);
      scheduled.push({ ...pin, scheduledAt: date.toISOString() });
    }
  }

  return scheduled;
}

export function formatPublishDate(isoDate: string, timeZone = "UTC"): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date).reduce<Record<string, string>>((result, part) => {
    result[part.type] = part.value;
    return result;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}
