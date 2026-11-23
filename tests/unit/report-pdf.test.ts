import { PDFParse } from "pdf-parse";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { reportPdf, UnsupportedReportCharacters } from "@/services/report-pdf";

describe("PDF reports", () => {
  it("generates readable multilingual, multipage reports without losing records", async () => {
    const rows = Array.from({ length: 60 }, (_, index) => [`Lieferant ${index} 東京`, `Certificate ${index}`]);
    const pdf = await reportPdf({ title: "Supplier compliance", headers: ["Supplier", "Document"], rows },
      "Müller GmbH", "Europe/Vienna", new Date("2026-01-02T03:04:05Z"));
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    const parser = new PDFParse({ data: pdf });
    try {
      const result = await parser.getText();
      expect(result.total).toBeGreaterThan(1);
      expect(result.text).toContain("Müller GmbH");
      expect(result.text).toContain("Lieferant 0 東京");
      expect(result.text).toContain("Certificate 59");
      expect(result.text).toContain("2026-01-02T03:04:05.000Z");
    } finally {
      await parser.destroy();
    }
  });

  it("explicitly rejects characters not supported by the embedded font", async () => {
    await expect(reportPdf({ title: "Report", headers: ["Supplier"], rows: [["Supplier 😀"]] },
      "Company", "Europe/Vienna", new Date())).rejects.toBeInstanceOf(UnsupportedReportCharacters);
  });

  it("explains an empty report", async () => {
    const pdf = await reportPdf({ title: "Report", headers: ["Supplier"], rows: [] },
      "Company", "Europe/Vienna", new Date("2026-01-02T03:04:05Z"));
    const parser = new PDFParse({ data: pdf });
    try {
      expect((await parser.getText()).text).toContain("No records to report.");
    } finally {
      await parser.destroy();
    }
  });
});
