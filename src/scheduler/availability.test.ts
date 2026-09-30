import { describe, expect, it } from "vitest";
import { findAvailableSlots, getSearchBoundaries } from "./availability";
import { slotSearchSchema } from "./types";

const baseSearch = {
  timezone: "Asia/Kolkata",
  dateRange: { startDate: "2026-10-06", endDate: "2026-10-06" },
  durationMinutes: 60,
  timeWindows: [{ start: "13:00", end: "15:30" }],
  intervalMinutes: 15,
  maxResults: 5,
};

describe("findAvailableSlots", () => {
  it("never offers time that overlaps a busy Calendar interval", () => {
    const search = slotSearchSchema.parse({
      ...baseSearch,
      busyIntervals: [{ start: "2026-10-06T08:00:00Z", end: "2026-10-06T08:45:00Z" }],
    });

    expect(findAvailableSlots(search).map((slot) => slot.localStart)).toEqual([
      "2026-10-06T14:15:00",
      "2026-10-06T14:30:00",
    ]);
    expect(findAvailableSlots(search).map((slot) => slot.id)).toEqual(["slot_1", "slot_2"]);
  });

  it("applies user-requested buffers around busy events", () => {
    const search = slotSearchSchema.parse({
      ...baseSearch,
      bufferMinutes: 30,
      busyIntervals: [{ start: "2026-10-06T08:00:00Z", end: "2026-10-06T08:30:00Z" }],
    });

    expect(findAvailableSlots(search).map((slot) => slot.localStart)).toEqual(["2026-10-06T14:30:00"]);
  });

  it("honors excluded weekdays while searching across dates", () => {
    const search = slotSearchSchema.parse({
      ...baseSearch,
      dateRange: { startDate: "2026-10-06", endDate: "2026-10-08" },
      excludedWeekdays: [2, 3],
      maxResults: 1,
    });

    expect(findAvailableSlots(search)[0]?.localStart).toBe("2026-10-08T13:00:00");
  });

  it("uses the user's timezone to create Calendar query boundaries", () => {
    const boundaries = getSearchBoundaries({
      timezone: "America/New_York",
      dateRange: { startDate: "2026-03-08", endDate: "2026-03-08" },
    });

    expect(boundaries).toEqual({ start: "2026-03-08T05:00:00Z", end: "2026-03-09T04:00:00Z" });
  });
});
