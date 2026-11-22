import { describe, expect, it } from "vitest";
import { classifyExpiry } from "../../src/domain/document-expiry";

const now = new Date("2026-03-01T12:00:00Z");

describe("document expiry", () => {
  it.each([
    ["2026-02-28", "expired"],
    ["2026-03-01", "within_7_days"],
    ["2026-03-08", "within_7_days"],
    ["2026-03-09", "within_30_days"],
    ["2026-03-31", "within_30_days"],
    ["2026-04-01", "within_60_days"],
    ["2026-04-30", "within_60_days"],
    ["2026-05-01", "within_90_days"],
    ["2026-05-29", "within_90_days"],
    ["2026-05-30", "within_90_days"],
    ["2026-05-31", "valid"],
  ])("classifies %s as %s", (expiry, expected) => {
    expect(classifyExpiry(expiry, now, "Europe/Vienna")).toBe(expected);
  });

  it("uses the company calendar day, including daylight-saving changes", () => {
    const instant = new Date("2026-03-28T23:30:00Z");
    expect(classifyExpiry("2026-03-28", instant, "Europe/Vienna")).toBe("expired");
    expect(classifyExpiry("2026-03-28", instant, "UTC")).toBe("within_7_days");
  });

  it.each(["2026-02-29", "2026-13-01", "03/01/2026"])("rejects invalid date %s", (date) => {
    expect(() => classifyExpiry(date, now, "UTC")).toThrow();
  });

  it("rejects invalid time zones and invalid clocks", () => {
    expect(() => classifyExpiry("2026-03-01", now, "Invalid/Zone")).toThrow();
    expect(() => classifyExpiry("2026-03-01", new Date("invalid"), "UTC")).toThrow();
  });
});
