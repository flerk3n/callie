import { describe, expect, it } from "vitest";
import { inferUsualDuration } from "./service";

describe("inferUsualDuration", () => {
  it("uses the most frequent valid historical meeting duration", () => {
    expect(
      inferUsualDuration([
        { start: "2026-01-05T09:00:00Z", end: "2026-01-05T09:30:00Z" },
        { start: "2026-01-12T09:00:00Z", end: "2026-01-12T09:30:00Z" },
        { start: "2026-01-19T09:00:00Z", end: "2026-01-19T10:00:00Z" },
      ]),
    ).toEqual({ durationMinutes: 30, observations: 2 });
  });

  it("ignores all-day, malformed, and out-of-range events", () => {
    expect(
      inferUsualDuration([
        { start: "2026-01-05", end: "2026-01-06" },
        { start: "not-a-date", end: "also-not-a-date" },
        { start: "2026-01-05T09:00:00Z", end: "2026-01-05T09:05:00Z" },
      ]),
    ).toBeNull();
  });
});
