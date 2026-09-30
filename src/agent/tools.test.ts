import { describe, expect, it } from "vitest";
import { findSlotsToolSchema } from "./tools";

describe("findSlotsToolSchema", () => {
  it("normalizes the flat agent payload into Callie's structured scheduler input", () => {
    expect(
      findSlotsToolSchema.parse({
        timezone: "Asia/Kolkata",
        startDate: "2026-10-02",
        endDate: "2026-10-03",
        durationMinutes: 30,
        preferredStart: "13:00",
        preferredEnd: "17:00",
      }),
    ).toEqual({
      timezone: "Asia/Kolkata",
      dateRange: { startDate: "2026-10-02", endDate: "2026-10-03" },
      durationMinutes: 30,
      timeWindows: [{ start: "13:00", end: "17:00" }],
      excludedWeekdays: [],
      bufferMinutes: 0,
      intervalMinutes: 15,
      maxResults: 3,
    });
  });

  it("uses a standard working-hours window when the user has no time preference", () => {
    expect(
      findSlotsToolSchema.parse({
        timezone: "Asia/Kolkata",
        startDate: "2026-10-02",
        endDate: "2026-10-02",
        durationMinutes: 30,
      }).timeWindows,
    ).toEqual([{ start: "09:00", end: "17:00" }]);
  });

  it("rejects an incomplete time preference", () => {
    expect(
      findSlotsToolSchema.safeParse({
        timezone: "Asia/Kolkata",
        startDate: "2026-10-02",
        endDate: "2026-10-02",
        durationMinutes: 30,
        preferredStart: "13:00",
      }).success,
    ).toBe(false);
  });
});
