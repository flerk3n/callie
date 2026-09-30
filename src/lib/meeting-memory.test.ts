import { describe, expect, it } from "vitest";
import { normalizeMeetingName } from "./meeting-memory";

describe("normalizeMeetingName", () => {
  it("makes equivalent spoken sync-up names share a durable key", () => {
    expect(normalizeMeetingName("  Sync-up! ")).toBe("sync up");
  });
});
