import { describe, expect, it } from "vitest";
import { getLocalDateContext } from "./local-date-context";

describe("getLocalDateContext", () => {
  it("uses the user's local calendar date rather than UTC", () => {
    const context = getLocalDateContext("Asia/Kolkata", new Date("2026-10-01T19:15:00Z"));

    expect(context.date).toBe("2026-10-02");
    expect(context.time).toContain("Friday");
    expect(context.time).toContain("October 2, 2026");
    expect(context.time).toMatch(/12:45\s?AM/);
    expect(context.timezone).toBe("Asia/Kolkata");
  });
});
