import { Temporal } from "@js-temporal/polyfill";
import type { AvailableSlot, SlotSearch } from "./types";

type InstantRange = { start: Temporal.Instant; end: Temporal.Instant };
type FreeBlock = InstantRange;

function toZonedDateTime(date: Temporal.PlainDate, time: string, timezone: string) {
  return date.toPlainDateTime(Temporal.PlainTime.from(time)).toZonedDateTime(timezone);
}

function normalizeBusyIntervals(search: SlotSearch): InstantRange[] {
  const intervals = search.busyIntervals.map((interval) => ({
    start: Temporal.Instant.from(interval.start).subtract({ minutes: search.bufferMinutes }),
    end: Temporal.Instant.from(interval.end).add({ minutes: search.bufferMinutes }),
  })).sort((left, right) => Temporal.Instant.compare(left.start, right.start));

  return intervals.reduce<InstantRange[]>((merged, interval) => {
    const previous = merged.at(-1);
    if (!previous || Temporal.Instant.compare(interval.start, previous.end) > 0) {
      merged.push(interval);
      return merged;
    }
    if (Temporal.Instant.compare(interval.end, previous.end) > 0) previous.end = interval.end;
    return merged;
  }, []);
}

function getFreeBlocks(windowStart: Temporal.Instant, windowEnd: Temporal.Instant, busyIntervals: InstantRange[]): FreeBlock[] {
  const blocks: FreeBlock[] = [];
  let cursor = windowStart;

  for (const busy of busyIntervals) {
    if (Temporal.Instant.compare(busy.end, cursor) <= 0) continue;
    if (Temporal.Instant.compare(busy.start, windowEnd) >= 0) break;

    const blockEnd = Temporal.Instant.compare(busy.start, windowEnd) < 0 ? busy.start : windowEnd;
    if (Temporal.Instant.compare(cursor, blockEnd) < 0) blocks.push({ start: cursor, end: blockEnd });
    if (Temporal.Instant.compare(busy.end, cursor) > 0) cursor = busy.end;
    if (Temporal.Instant.compare(cursor, windowEnd) >= 0) break;
  }

  if (Temporal.Instant.compare(cursor, windowEnd) < 0) blocks.push({ start: cursor, end: windowEnd });
  return blocks;
}

function canFit(block: FreeBlock, durationMinutes: number) {
  return Temporal.Instant.compare(block.start.add({ minutes: durationMinutes }), block.end) <= 0;
}

function toAvailableSlot(start: Temporal.Instant, durationMinutes: number, timezone: string, id: string): AvailableSlot {
  const end = start.add({ minutes: durationMinutes });
  const localStart = start.toZonedDateTimeISO(timezone).toPlainDateTime();
  const localEnd = end.toZonedDateTimeISO(timezone).toPlainDateTime();
  return {
    id,
    start: start.toString(),
    end: end.toString(),
    timezone,
    localStart: localStart.toString(),
    localEnd: localEnd.toString(),
  };
}

function naturalTimePenalty(slot: AvailableSlot) {
  const minute = Number(slot.localStart.slice(14, 16));
  if (minute === 0) return 0;
  if (minute === 30) return 0.5;
  return 1 + Math.min(minute, 60 - minute) / 60;
}

function selectBalancedSlots(candidates: AvailableSlot[], maxResults: number) {
  if (candidates.length <= maxResults) return candidates;

  const selected = new Set<number>();
  for (let position = 0; position < maxResults; position += 1) {
    const target = maxResults === 1
      ? (candidates.length - 1) / 2
      : (candidates.length - 1) * (0.15 + (0.7 * position) / (maxResults - 1));
    let bestIndex = -1;
    let bestScore = Number.POSITIVE_INFINITY;

    for (let index = 0; index < candidates.length; index += 1) {
      if (selected.has(index)) continue;
      const score = Math.abs(index - target) + naturalTimePenalty(candidates[index]) * 1.5;
      if (score < bestScore) {
        bestIndex = index;
        bestScore = score;
      }
    }
    selected.add(bestIndex);
  }

  return [...selected].sort((left, right) => left - right).map((index) => candidates[index]);
}

export function getSearchBoundaries(search: Pick<SlotSearch, "dateRange" | "timezone">) {
  const startDate = Temporal.PlainDate.from(search.dateRange.startDate);
  const endDate = Temporal.PlainDate.from(search.dateRange.endDate).add({ days: 1 });
  return {
    start: toZonedDateTime(startDate, "00:00", search.timezone).toInstant().toString(),
    end: toZonedDateTime(endDate, "00:00", search.timezone).toInstant().toString(),
  };
}

export function findAvailableSlots(input: SlotSearch): AvailableSlot[] {
  const search = input;
  const busyIntervals = normalizeBusyIntervals(search);
  const candidates: AvailableSlot[] = [];
  let date = Temporal.PlainDate.from(search.dateRange.startDate);
  const lastDate = Temporal.PlainDate.from(search.dateRange.endDate);

  while (Temporal.PlainDate.compare(date, lastDate) <= 0) {
    if (!search.excludedWeekdays.includes(date.dayOfWeek)) {
      for (const window of search.timeWindows) {
        const windowStart = toZonedDateTime(date, window.start, search.timezone).toInstant();
        const windowEnd = toZonedDateTime(date, window.end, search.timezone).toInstant();
        const freeBlocks = getFreeBlocks(windowStart, windowEnd, busyIntervals).filter((block) => canFit(block, search.durationMinutes));

        if (search.selectionStrategy === "earliest" || search.selectionStrategy === "latest") {
          const rankedBlocks = search.selectionStrategy === "earliest" ? freeBlocks : [...freeBlocks].reverse();
          for (const block of rankedBlocks) {
            const start = search.selectionStrategy === "earliest"
              ? block.start
              : block.end.subtract({ minutes: search.durationMinutes });
            candidates.push(toAvailableSlot(start, search.durationMinutes, search.timezone, `slot_${candidates.length + 1}`));
          }
          continue;
        }

        let candidate = windowStart;
        while (Temporal.Instant.compare(candidate.add({ minutes: search.durationMinutes }), windowEnd) <= 0) {
          const candidateEnd = candidate.add({ minutes: search.durationMinutes });
          if (freeBlocks.some((block) => Temporal.Instant.compare(candidate, block.start) >= 0 && Temporal.Instant.compare(candidateEnd, block.end) <= 0)) {
            candidates.push(toAvailableSlot(candidate, search.durationMinutes, search.timezone, `slot_${candidates.length + 1}`));
          }
          candidate = candidate.add({ minutes: search.intervalMinutes });
        }
      }
    }
    date = date.add({ days: 1 });
  }

  const selected = search.selectionStrategy === "balanced"
    ? selectBalancedSlots(candidates, search.maxResults)
    : candidates
      .sort((left, right) => search.selectionStrategy === "earliest"
        ? Temporal.Instant.compare(Temporal.Instant.from(left.start), Temporal.Instant.from(right.start))
        : Temporal.Instant.compare(Temporal.Instant.from(right.start), Temporal.Instant.from(left.start)))
      .slice(0, search.maxResults);
  return selected.map((slot, index) => ({ ...slot, id: `slot_${index + 1}` }));
}
