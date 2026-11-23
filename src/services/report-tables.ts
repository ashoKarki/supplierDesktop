import { buildReports } from "@/domain/reports";
import { z } from "zod";

type Reports = ReturnType<typeof buildReports>;
export const reportKinds = ["compliance", "expiry", "outstanding"] as const;
export type ReportKind = (typeof reportKinds)[number];
type Cell = string | number | null;
export type ReportTable = { title: string; headers: string[]; rows: Cell[][] };

export function reportTableForRows(kind: ReportKind, input: unknown[]): ReportTable {
  switch (kind) {
    case "compliance": {
      const rows = z.array(z.object({
        supplier: z.string(),
        required: z.number().int().nonnegative(),
        approved: z.number().int().nonnegative(),
        missing: z.number().int().nonnegative(),
        expired: z.number().int().nonnegative(),
        status: z.string(),
      })).parse(input);
      return {
        title: "Supplier compliance",
        headers: ["Supplier", "Required documents", "Approved documents", "Missing documents", "Expired documents", "Overall status"],
        rows: rows.map((row) => [row.supplier, row.required, row.approved, row.missing, row.expired, row.status]),
      };
    }
    case "expiry": {
      const rows = z.array(z.object({
        document: z.string(),
        supplier: z.string(),
        date: z.iso.date().nullable(),
        days: z.number().int().nullable(),
        status: z.string(),
      })).parse(input);
      return {
        title: "Document expiry",
        headers: ["Document", "Supplier", "Expiry date", "Days remaining", "Status"],
        rows: rows.map((row) => [row.document, row.supplier, row.date, row.days, row.status]),
      };
    }
    case "outstanding": {
      const rows = z.array(z.object({
        supplier: z.string(),
        document: z.string(),
        requested: z.string(),
        deadline: z.iso.date().nullable(),
        status: z.string(),
      })).parse(input);
      return {
        title: "Outstanding requests",
        headers: ["Supplier", "Requested document", "Request timestamp", "Deadline", "Status"],
        rows: rows.map((row) => [row.supplier, row.document, row.requested, row.deadline, row.status]),
      };
    }
  }
}

export function reportTables(reports: Reports): Record<ReportKind, ReportTable> {
  return {
    compliance: reportTableForRows("compliance", reports.compliance),
    expiry: reportTableForRows("expiry", reports.expiry),
    outstanding: reportTableForRows("outstanding", reports.outstanding),
  };
}
