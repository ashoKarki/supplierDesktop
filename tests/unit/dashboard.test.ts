import { describe, expect, it } from "vitest";
import { buildDashboard } from "@/domain/dashboard";
import type { DocumentStatus } from "@/domain/document-state";

const now = new Date("2026-01-01T23:30:00Z");
const suppliers = [
  { id: "s1", name: "Active", archived_at: null },
  { id: "s2", name: "Archived", archived_at: "2025-01-01" },
];
const requirements = ["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8"].map((id) => ({ id, name: id }));
function request(id: string, supplier_id = "s1", created_at = "2026-01-01T00:00:00Z", deadline: string | null = null) {
  return { id, supplier_id, created_at, deadline };
}
function item(id: string, request_id: string, requirement_id: string, status: Exclude<DocumentStatus, "superseded">, expires_on: string | null = null) {
  return { id, request_id, requirement_id, status, expires_on };
}

describe("workspace dashboard", () => {
  it("counts current obligations once and excludes archived suppliers and cancelled latest requests", () => {
    const data = buildDashboard({
      suppliers, requirements, now, timeZone: "Europe/Vienna",
      requests: [
        request("old", "s1", "2025-01-01T00:00:00Z"),
        request("current"), request("archived", "s2"),
      ],
      items: [
        item("old1", "old", "r1", "approved", "2026-01-01"),
        item("new1", "current", "r1", "requested"),
        item("old2", "old", "r2", "requested"),
        item("new2", "current", "r2", "cancelled"),
        item("new3", "current", "r3", "submitted"),
        item("new4", "current", "r4", "under_review"),
        item("new5", "current", "r5", "rejected"),
        item("new6", "current", "r6", "approved", "2026-01-01"),
        item("new7", "current", "r7", "approved", "2026-04-02"),
        item("new8", "current", "r8", "expired"),
        item("archived1", "archived", "r1", "requested"),
      ],
    });
    expect(data).toMatchObject({ totalSuppliers: 2, activeSuppliers: 1, missing: 1, pending: 2, rejected: 1, expired: 2 });
    expect(data.expiring).toEqual([{ itemId: "new7", requestId: "current", supplier: "Active", requirement: "r7", date: "2026-04-02" }]);
  });

  it("uses the company calendar, includes the 90-day boundary and sorts expiring documents", () => {
    const data = buildDashboard({
      suppliers, requirements, now, timeZone: "America/New_York",
      requests: [request("current")],
      items: [
        item("b", "current", "r2", "approved", "2026-04-01"),
        item("a", "current", "r1", "approved", "2026-01-01"),
        item("outside", "current", "r3", "approved", "2026-04-02"),
      ],
    });
    expect(data.expired).toBe(0);
    expect(data.expiring.map((entry) => entry.itemId)).toEqual(["a", "b"]);
  });

  it("counts the 7, 30, 60 and 90-day expiry windows cumulatively", () => {
    const data = buildDashboard({
      suppliers, requirements, now: new Date("2026-01-01T12:00:00Z"), timeZone: "Europe/Vienna",
      requests: [request("current")],
      items: [
        item("7", "current", "r1", "approved", "2026-01-08"),
        item("30", "current", "r2", "approved", "2026-01-31"),
        item("60", "current", "r3", "approved", "2026-03-02"),
        item("90", "current", "r4", "approved", "2026-04-01"),
        item("91", "current", "r5", "approved", "2026-04-02"),
      ],
    });
    expect(data.expiryCounts).toEqual({ within7: 1, within30: 2, within60: 3, within90: 4 });
  });

  it("orders microsecond timestamps before applying the ID tie-breaker", () => {
    const data = buildDashboard({
      suppliers, requirements, now, timeZone: "Europe/Vienna",
      requests: [
        request("z", "s1", "2026-01-01T00:00:00.123001+00:00"),
        request("a", "s1", "2026-01-01T00:00:00.123002+00:00"),
        request("b", "s1", "2026-01-01T00:00:00.123002+00:00"),
      ],
      items: [item("z", "z", "r1", "requested"), item("a", "a", "r1", "rejected"), item("b", "b", "r1", "submitted")],
    });
    expect(data).toMatchObject({ missing: 0, rejected: 0, pending: 1 });
  });

  it("counts overdue requests once, only for current outstanding items and after the company deadline", () => {
    const data = buildDashboard({
      suppliers, requirements, now, timeZone: "Europe/Vienna",
      requests: [
        request("late", "s1", "2025-12-01T00:00:00Z", "2026-01-01"),
        request("today", "s1", "2025-12-02T00:00:00Z", "2026-01-02"),
        request("archived", "s2", "2025-12-01T00:00:00Z", "2025-12-01"),
      ],
      items: [
        item("late1", "late", "r1", "requested"),
        item("late2", "late", "r2", "rejected"),
        item("late3", "late", "r3", "under_review"),
        item("today1", "today", "r4", "requested"),
        item("archived1", "archived", "r1", "requested"),
      ],
    });
    expect(data.overdueRequests).toBe(1);
    expect(buildDashboard({
      suppliers, requirements, now, timeZone: "America/New_York",
      requests: [request("late", "s1", "2025-12-01T00:00:00Z", "2026-01-01")],
      items: [item("late1", "late", "r1", "requested")],
    }).overdueRequests).toBe(0);
  });

  it("fails explicitly for incomplete or invalid data", () => {
    const input = {
      suppliers, requirements, now, timeZone: "Europe/Vienna",
      requests: [request("current")],
      items: [item("1", "current", "r1", "approved", "2026-02-01")],
    };
    expect(() => buildDashboard({ ...input, requests: [] })).toThrow("request data is incomplete");
    expect(() => buildDashboard({ ...input, suppliers: [] })).toThrow("supplier data is incomplete");
    expect(() => buildDashboard({ ...input, requirements: [] })).toThrow("requirement data is incomplete");
    expect(() => buildDashboard({ ...input, requests: [request("current", "s1", "invalid")] })).toThrow("request date is invalid");
    expect(() => buildDashboard({ ...input, timeZone: "invalid" })).toThrow();
  });
});
