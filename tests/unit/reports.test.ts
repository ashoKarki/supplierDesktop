import { describe, expect, it } from "vitest";
import { buildReports } from "@/domain/reports";
import type { Item, WorkspaceDocuments } from "@/domain/dashboard";
import { reportCsv } from "@/services/report-csv";

const now = new Date("2026-01-01T12:00:00Z");
function fixture(items: Pick<Item, "status" | "expires_on">[]): WorkspaceDocuments {
  return {
    suppliers: [{ id: "s", name: "Supplier", archived_at: null }, { id: "archived", name: "Archived", archived_at: "2025-01-01" }],
    requirements: items.map((_, index) => ({ id: `r${index}`, name: `Document ${index}` })),
    requests: [{ id: "request", supplier_id: "s", created_at: "2025-12-01T00:00:00Z", deadline: "2025-12-31" }],
    items: items.map((item, index) => ({ ...item, id: `i${index}`, request_id: "request", requirement_id: `r${index}` })),
  };
}
const item = (status: Item["status"], expires_on: string | null = null) => ({ status, expires_on });

describe("reports", () => {
  it.each([
    [[item("rejected"), item("expired")], "Action required"],
    [[item("expired"), item("requested")], "Expired"],
    [[item("requested"), item("submitted")], "Incomplete"],
    [[item("submitted"), item("approved", "2026-01-08")], "Pending review"],
    [[item("under_review")], "Pending review"],
    [[item("approved", "2026-01-08")], "Expiring"],
    [[item("approved", "2026-01-01")], "Expiring"],
    [[item("approved", "2025-12-31")], "Expired"],
    [[item("approved", "2026-04-02")], "Complete"],
    [[item("approved")], "Complete"],
    [[item("cancelled")], "Not assessed"],
    [[], "Not assessed"],
  ] as const)("calculates priority for %j", (items, expected) => {
    const report = buildReports(fixture([...items]), now, "Europe/Vienna");
    expect(report.compliance).toHaveLength(1);
    expect(report.compliance[0]?.status).toBe(expected);
  });

  it("reports expiries and outstanding items with company-calendar deadlines", () => {
    const report = buildReports(fixture([
      item("requested"), item("rejected"), item("approved", "2026-01-08"),
      item("approved", "2025-12-31"), item("expired"), item("submitted"), item("approved"),
    ]), now, "Europe/Vienna");
    expect(report.compliance[0]).toMatchObject({ required: 7, approved: 2, missing: 1, expired: 2, status: "Action required" });
    expect(report.outstanding.map((row) => row.status)).toEqual(["Overdue", "Overdue"]);
    expect(report.expiry).toEqual(expect.arrayContaining([
      expect.objectContaining({ date: "2026-01-08", days: 7, status: "Expiring" }),
      expect.objectContaining({ date: "2025-12-31", days: -1, status: "Expired" }),
      expect.objectContaining({ date: null, days: null, status: "Expired" }),
    ]));
  });

  it("distinguishes undated and same-day outstanding requests from overdue", () => {
    const data = fixture([item("requested"), item("rejected")]);
    data.requests[0]!.deadline = "2026-01-01";
    expect(buildReports(data, now, "Europe/Vienna").outstanding.map((row) => row.status))
      .toEqual(["Outstanding", "Action required"]);
    data.requests[0]!.deadline = null;
    expect(buildReports(data, now, "Europe/Vienna").outstanding[0]?.status).toBe("Outstanding");
  });

  it("escapes CSV fields and prevents spreadsheet formula execution", () => {
    expect(reportCsv([["=1+1", " \t+SUM(A1)", "@name", "\ttext", 'a,"b"', -7, null]]))
      .toBe('"\'=1+1","\' \t+SUM(A1)","\'@name","\'\ttext","a,""b""","-7",""\r\n');
  });
});
