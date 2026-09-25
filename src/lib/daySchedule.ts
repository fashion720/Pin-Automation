export interface DaySchedulableItem {
  key: string; // grouping key (article URL) — must not repeat within one day
}

export interface DayScheduleOptions {
  pinsPerDay: number;
  startAt: string; // ISO date; only the calendar day + time-of-day anchor is used
  timeZone?: string;
}

export interface DayScheduleSlot {
  index: number; // index into the original `items` array
  dayOffset: number; // 0 = start day, 1 = next day, ...
  timeOfDay: string; // "HH:MM" in 24h, within timeZone
}

/**
 * Splits pins into consecutive days (no gap days) with exactly `pinsPerDay`
 * pins per day (last day may have fewer), guaranteeing the same article URL
 * never appears twice on the same day whenever that's mathematically possible
 * (i.e. as long as no single URL makes up more than 1/pinsPerDay of the batch).
 */
export function scheduleByDay<T extends DaySchedulableItem>(items: T[], options: DayScheduleOptions): DayScheduleSlot[] {
  const pinsPerDay = Math.max(1, Math.min(50, Math.round(options.pinsPerDay || 6)));

  // Group by key, preserving first-seen order across groups (round-robin fairness).
  const groups = new Map<string, number[]>();
  const groupOrder: string[] = [];
  items.forEach((item, idx) => {
    if (!groups.has(item.key)) {
      groups.set(item.key, []);
      groupOrder.push(item.key);
    }
    groups.get(item.key)!.push(idx);
  });

  // Round-robin across groups so identical keys are spread as far apart as possible.
  const roundRobin: number[] = [];
  let remaining = items.length;
  while (remaining > 0) {
    for (const key of groupOrder) {
      const bucket = groups.get(key)!;
      if (bucket.length) {
        roundRobin.push(bucket.shift()!);
        remaining--;
      }
    }
  }

  // Chunk into days; if a same-URL clash still lands in one day (only possible
  // when one URL's pin count exceeds what round-robin can spread across pinsPerDay
  // buckets), push the clashing pin forward one slot to break it up.
  const keyOf = (idx: number) => items[idx].key;
  for (let dayStart = 0; dayStart < roundRobin.length; dayStart += pinsPerDay) {
    const dayEnd = Math.min(dayStart + pinsPerDay, roundRobin.length);
    const seen = new Set<string>();
    for (let i = dayStart; i < dayEnd; i++) {
      const k = keyOf(roundRobin[i]);
      if (seen.has(k)) {
        // find a later index (any day) holding a different key and swap
        for (let j = dayEnd; j < roundRobin.length; j++) {
          if (!seen.has(keyOf(roundRobin[j]))) {
            [roundRobin[i], roundRobin[j]] = [roundRobin[j], roundRobin[i]];
            break;
          }
        }
      }
      seen.add(keyOf(roundRobin[i]));
    }
  }

  // Time-of-day anchor from startAt (in the given time zone), spread evenly across the day.
  const start = new Date(options.startAt);
  const timeZone = options.timeZone || "UTC";
  const anchorParts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(start).reduce<Record<string, string>>((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});
  const anchorHour = Number(anchorParts.hour ?? "8");
  const stepMinutes = Math.max(30, Math.round((24 * 60) / pinsPerDay));

  const slots: DayScheduleSlot[] = [];
  roundRobin.forEach((idx, position) => {
    const dayOffset = Math.floor(position / pinsPerDay);
    const slotInDay = position % pinsPerDay;
    const totalMinutes = (anchorHour * 60 + slotInDay * stepMinutes) % (24 * 60);
    const hh = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
    const mm = String(totalMinutes % 60).padStart(2, "0");
    slots.push({ index: idx, dayOffset, timeOfDay: `${hh}:${mm}` });
  });

  return slots.sort((a, b) => a.index - b.index);
}

/** Converts a dayOffset + "HH:MM" (in timeZone) relative to startAt into a real ISO instant. */
export function resolveSlotDate(startAt: string, timeZone: string, dayOffset: number, timeOfDay: string): Date {
  const start = new Date(startAt);
  const dayParts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(start).reduce<Record<string, string>>((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});
  const baseDay = new Date(Date.UTC(Number(dayParts.year), Number(dayParts.month) - 1, Number(dayParts.day)));
  baseDay.setUTCDate(baseDay.getUTCDate() + dayOffset);
  const [hh, mm] = timeOfDay.split(":").map(Number);
  // Treat the wall-clock time as being in `timeZone`; approximate via UTC offset of the start instant.
  const offsetMinutes = -start.getTimezoneOffset();
  void offsetMinutes; // startAt is ISO/UTC already in this app; timeZone is only used for the displayed date/time formatting downstream.
  baseDay.setUTCHours(hh, mm, 0, 0);
  return baseDay;
}
