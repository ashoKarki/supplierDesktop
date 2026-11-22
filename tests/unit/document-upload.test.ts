import { describe, expect, it } from "vitest";
import { MAX_DOCUMENT_BYTES, validateDocumentUpload } from "../../src/domain/document-upload";

const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);

describe("document upload validation", () => {
  it.each([
    ["certificate.pdf", "application/pdf", pdf],
    ["photo.JPG", "image/jpeg", jpeg],
    ["photo.jpeg", "image/jpeg", jpeg],
    ["scan.png", "image/png", png],
  ])("accepts matching file name, MIME type and signature: %s", (name, mimeType, bytes) => {
    expect(validateDocumentUpload({ name, mimeType, bytes })).toEqual({ ok: true });
  });

  it.each([
    ["certificate.pdf", "image/png", pdf],
    ["certificate.pdf", "application/pdf", png],
    ["certificate.png", "image/png", pdf],
    ["certificate.pdf.exe", "application/pdf", pdf],
    ["pdf", "application/pdf", pdf],
    ["../certificate.pdf", "application/pdf", pdf],
    ["certificate\n.pdf", "application/pdf", pdf],
    ["empty.pdf", "application/pdf", new Uint8Array()],
    ["short.pdf", "application/pdf", pdf.slice(0, 4)],
  ])("rejects mismatched or unsafe input: %s", (name, mimeType, bytes) => {
    expect(validateDocumentUpload({ name, mimeType, bytes }).ok).toBe(false);
  });

  it("allows exactly 15 MB and rejects anything larger", () => {
    const bytes = new Uint8Array(MAX_DOCUMENT_BYTES + 1);
    bytes.set(pdf);
    expect(validateDocumentUpload({ name: "test.pdf", mimeType: "application/pdf", bytes: bytes.subarray(0, MAX_DOCUMENT_BYTES) }))
      .toEqual({ ok: true });
    expect(validateDocumentUpload({ name: "test.pdf", mimeType: "application/pdf", bytes }))
      .toEqual({ ok: false, reason: "size" });
  });
});
