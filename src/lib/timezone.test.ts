import { describe, expect, it } from "vitest";
import { isSupportedTimeZone } from "./timezone";

describe("isSupportedTimeZone", () => {
  it("accepts browser IANA timezones and rejects invalid values", () => {
    expect(isSupportedTimeZone("Asia/Kolkata")).toBe(true);
    expect(isSupportedTimeZone("not-a-timezone")).toBe(false);
  });
});
