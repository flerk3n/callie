import { describe, expect, it } from "vitest";
import { bookEventToolSchema, findEventToolSchema, findSlotsToolSchema, getCalendarEventQuery, getOfferedSlot, usualMeetingToolSchema } from "./tools";

describe("findSlotsToolSchema", () => {
  it("accepts a flat time-window request without asking the agent for timezone", () => {
    expect(
      findSlotsToolSchema.parse({
        startDate: "2026-10-02",
        endDate: "2026-10-03",
        durationMinutes: 30,
        preferredStart: "13:00",
        preferredEnd: "17:00",
      }),
    ).toEqual({
      startDate: "2026-10-02",
      endDate: "2026-10-03",
      durationMinutes: 30,
      preferredStart: "13:00",
      preferredEnd: "17:00",
    });
  });

  it("accepts an exact requested start without turning it into a broad window", () => {
    expect(
      findSlotsToolSchema.parse({
        startDate: "2026-10-02",
        endDate: "2026-10-02",
        durationMinutes: 60,
        exactStart: "09:00",
      }),
    ).toEqual({ startDate: "2026-10-02", endDate: "2026-10-02", durationMinutes: 60, exactStart: "09:00" });
  });

  it("accepts an event-relative request by title and date instead of an opaque Calendar ID", () => {
    expect(
      findSlotsToolSchema.parse({
        durationMinutes: 60,
        anchorEventTitle: "Test Meeting",
        anchorDate: "2026-10-02",
        relativePosition: "before",
      }),
    ).toEqual({
      durationMinutes: 60,
      anchorEventTitle: "Test Meeting",
      anchorDate: "2026-10-02",
      relativePosition: "before",
    });
  });

  it("rejects an incomplete time preference", () => {
    expect(
      findSlotsToolSchema.safeParse({
        startDate: "2026-10-02",
        endDate: "2026-10-02",
        durationMinutes: 30,
        preferredStart: "13:00",
      }).success,
    ).toBe(false);
  });

  it("requires a full date range when no relative event is supplied", () => {
    expect(findSlotsToolSchema.safeParse({ durationMinutes: 30 }).success).toBe(false);
  });

  it("rejects the former raw event-ID anchor contract", () => {
    expect(
      findSlotsToolSchema.safeParse({
        durationMinutes: 30,
        anchorEventId: "calendar-event-123",
        relativePosition: "after",
      }).success,
    ).toBe(false);
  });
});

describe("findEventToolSchema", () => {
  it("keeps event search fields flat and timezone-free for the voice agent", () => {
    expect(
      findEventToolSchema.parse({
        query: "design review",
        startDate: "2026-10-02",
        endDate: "2026-10-02",
      }),
    ).toEqual({
      query: "design review",
      startDate: "2026-10-02",
      endDate: "2026-10-02",
    });
  });

  it("accepts an agenda request without a text query", () => {
    expect(
      findEventToolSchema.parse({
        startDate: "2026-10-02",
        endDate: "2026-10-02",
      }),
    ).toEqual({ startDate: "2026-10-02", endDate: "2026-10-02" });
  });

  it("turns generic event words into an agenda lookup but keeps meeting searches as queries", () => {
    for (const query of ["events", "my calendar", "agenda"]) {
      expect(getCalendarEventQuery(query)).toBeUndefined();
    }
    expect(getCalendarEventQuery("meetings")).toBe("meetings");
    expect(getCalendarEventQuery("design review")).toBe("design review");
  });
});

describe("bookEventToolSchema", () => {
  it("adds safe server defaults to the small agent payload", () => {
    expect(
      bookEventToolSchema.parse({
        slotId: "slot_1",
        confirmed: true,
      }),
    ).toEqual({ title: "Meeting", slotId: "slot_1", confirmed: true });
  });

  it("resolves only a previously offered slot by its stable identifier", () => {
    const draft = {
      slots: [{ id: "slot_1", start: "2026-10-02T03:00:00Z", end: "2026-10-02T03:30:00Z", timezone: "Asia/Kolkata" }],
    };
    expect(getOfferedSlot(draft, "slot_1")).toEqual({
      id: "slot_1",
      start: "2026-10-02T03:00:00Z",
      end: "2026-10-02T03:30:00Z",
      timezone: "Asia/Kolkata",
    });
    expect(getOfferedSlot(draft, "slot_2")).toBeNull();
  });
});

describe("usualMeetingToolSchema", () => {
  it("accepts a small, flat meeting reference from the voice agent", () => {
    expect(usualMeetingToolSchema.parse({ meetingName: "sync-up" })).toEqual({ meetingName: "sync-up" });
  });
});
