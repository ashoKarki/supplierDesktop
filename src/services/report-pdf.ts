import "server-only";

import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as fontkit from "fontkit";
import PDFDocument from "pdfkit";
import type { ReportTable } from "./report-tables";

export class UnsupportedReportCharacters extends Error {
  constructor() {
    super("Report contains characters not supported by the PDF font");
    this.name = "UnsupportedReportCharacters";
  }
}

const fontPath = join(process.cwd(), "node_modules", "@fontsource", "unifont", "files", "unifont-latin-400-normal.woff");
let fontData: Buffer | undefined;

export async function reportPdf(table: ReportTable, company: string, timeZone: string, generatedAt: Date): Promise<Buffer> {
  const fontBuffer = fontData ??= readFileSync(fontPath);
  const font = fontkit.create(fontBuffer);
  if (!("hasGlyphForCodePoint" in font)) throw new Error("Report font is not a single font");
  const strings = [
    table.title, company, timeZone, ...table.headers,
    ...table.rows.flatMap((row) => row.map((cell) => cell === null ? "" : String(cell))),
  ];
  for (const text of strings) {
    for (const character of text) {
      const codePoint = character.codePointAt(0);
      if (codePoint !== undefined && codePoint !== 9 && codePoint !== 10 && codePoint !== 13
        && !font.hasGlyphForCodePoint(codePoint)) throw new UnsupportedReportCharacters();
    }
  }
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48, info: { Title: table.title } });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.font(fontBuffer).fontSize(18).text(table.title);
    doc.moveDown(0.5).fontSize(10).text(`Company: ${company}`);
    doc.text(`Time zone: ${timeZone}`);
    doc.text(`Generated: ${generatedAt.toISOString()}`);
    if (table.rows.length === 0) doc.moveDown().text("No records to report.");
    table.rows.forEach((row, index) => {
      doc.moveDown().fontSize(11).text(`Record ${index + 1}`);
      row.forEach((cell, cellIndex) => {
        const label = table.headers[cellIndex];
        if (label === undefined) throw new Error("Report row does not match its headers");
        doc.fontSize(9).text(`${label}: ${cell === null ? "Not recorded" : String(cell)}`, { lineGap: 2 });
      });
    });
    doc.end();
  });
}
