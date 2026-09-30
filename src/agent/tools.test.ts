import { describe, expect, it } from "vitest";
import { bookEventToolSchema, findEventToolSchema, findSlotsToolSchema, isOfferedSlot } from "./tools";

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

describe("findEventToolSchema", () => {
  it("turns simple local dates into Calendar API boundaries", () => {
    expect(
      findEventToolSchema.parse({
        query: "design review",
        timezone: "Asia/Kolkata",
        startDate: "2026-10-02",
        endDate: "2026-10-02",
      }),
    ).toEqual({
      query: "design review",
      timeMin: "2026-10-01T18:30:00Z",
      timeMax: "2026-10-02T18:30:00Z",
    });
  });
});

describe("bookEventToolSchema", () => {
  it("adds safe server defaults to the small agent payload", () => {
    expect(
      bookEventToolSchema.parse({
        startsAt: "2026-10-02T08:30:00+05:30",
        endsAt: "2026-10-02T09:00:00+05:30",
        timezone: "Asia/Kolkata",
        confirmed: true,
      }),
    ).toMatchObject({ title: "Meeting", attendeeEmails: [], createMeetLink: true, confirmed: true });
  });

  it("only recognizes an exact previously offered slot as bookable", () => {
    const draft = { slots: [{ start: "2026-10-02T08:30:00+05:30", end: "2026-10-02T09:00:00+05:30" }] };
    expect(isOfferedSlot(draft, "2026-10-02T08:30:00+05:30", "2026-10-02T09:00:00+05:30")).toBe(true);
    expect(isOfferedSlot(draft, "2026-10-02T09:30:00+05:30", "2026-10-02T10:00:00+05:30")).toBe(false);
  });
});
