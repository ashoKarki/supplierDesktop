import { describe, expect, it } from "vitest";
import { documentRequirementSchema, renewalDate } from "../../src/domain/document-requirement";

describe("document requirements", () => {
  const valid = { name: "ISO 9001", renewalMonths: 12 };

  it("trims a valid name", () => {
    expect(documentRequirementSchema.parse({ ...valid, name: " ISO 9001 " })).toEqual(valid);
  });

  it.each([
    { ...valid, name: " " },
    { ...valid, renewalMonths: 0 },
    { ...valid, renewalMonths: 1.5 },
    { ...valid, renewalMonths: 121 },
  ])("rejects invalid input", (input) => {
    expect(documentRequirementSchema.safeParse(input).success).toBe(false);
  });

  it("clamps renewal dates at the end of the destination month", () => {
    expect(renewalDate("2024-02-29", 12)).toBe("2025-02-28");
    expect(renewalDate("2026-01-31", 1)).toBe("2026-02-28");
    expect(renewalDate("2026-01-15", 2)).toBe("2026-03-15");
  });

  it("rejects invalid dates and intervals", () => {
    expect(() => renewalDate("2026-02-30", 12)).toThrow();
    expect(() => renewalDate("2026-01-01", -1)).toThrow();
  });
});
