import { Temporal } from "@js-temporal/polyfill";
import type { AvailableSlot, SlotSearch } from "./types";

type InstantRange = { start: Temporal.Instant; end: Temporal.Instant };

function toZonedDateTime(date: Temporal.PlainDate, time: string, timezone: string) {
  return date.toPlainDateTime(Temporal.PlainTime.from(time)).toZonedDateTime(timezone);
}

function overlaps(start: Temporal.Instant, end: Temporal.Instant, busy: InstantRange) {
  return Temporal.Instant.compare(start, busy.end) < 0 && Temporal.Instant.compare(end, busy.start) > 0;
}

function normalizeBusyIntervals(search: SlotSearch): InstantRange[] {
  return search.busyIntervals.map((interval) => ({
    start: Temporal.Instant.from(interval.start).subtract({ minutes: search.bufferMinutes }),
    end: Temporal.Instant.from(interval.end).add({ minutes: search.bufferMinutes }),
  }));
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
  const results: AvailableSlot[] = [];
  let date = Temporal.PlainDate.from(search.dateRange.startDate);
  const lastDate = Temporal.PlainDate.from(search.dateRange.endDate);

  while (Temporal.PlainDate.compare(date, lastDate) <= 0 && results.length < search.maxResults) {
    if (!search.excludedWeekdays.includes(date.dayOfWeek)) {
      for (const window of search.timeWindows) {
        const windowEnd = toZonedDateTime(date, window.end, search.timezone);
        let candidate = toZonedDateTime(date, window.start, search.timezone);

        while (Temporal.ZonedDateTime.compare(candidate.add({ minutes: search.durationMinutes }), windowEnd) <= 0) {
          const candidateEnd = candidate.add({ minutes: search.durationMinutes });
          const start = candidate.toInstant();
          const end = candidateEnd.toInstant();

          if (!busyIntervals.some((busy) => overlaps(start, end, busy))) {
            results.push({
              id: `slot_${results.length + 1}`,
              start: start.toString(),
              end: end.toString(),
              timezone: search.timezone,
              localStart: candidate.toPlainDateTime().toString(),
              localEnd: candidateEnd.toPlainDateTime().toString(),
            });
            if (results.length >= search.maxResults) break;
          }
          candidate = candidate.add({ minutes: search.intervalMinutes });
        }
        if (results.length >= search.maxResults) break;
      }
    }
    date = date.add({ days: 1 });
  }
  return results;
}
