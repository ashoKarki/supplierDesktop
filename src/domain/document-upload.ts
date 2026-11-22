export const MAX_DOCUMENT_BYTES = 15_000_000;

const formats = {
  pdf: { mime: "application/pdf", signature: [0x25, 0x50, 0x44, 0x46, 0x2d] },
  png: { mime: "image/png", signature: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  jpg: { mime: "image/jpeg", signature: [0xff, 0xd8, 0xff] },
  jpeg: { mime: "image/jpeg", signature: [0xff, 0xd8, 0xff] },
} as const;

type UploadValidation =
  | { ok: true }
  | { ok: false; reason: "size" | "filename" | "type" };

export function validateDocumentUpload(input: {
  name: string;
  mimeType: string;
  bytes: Uint8Array;
}): UploadValidation {
  if (input.bytes.length === 0 || input.bytes.length > MAX_DOCUMENT_BYTES) {
    return { ok: false, reason: "size" };
  }
  if (input.name.length > 255 || /[/\\\x00-\x1f\x7f]/.test(input.name)) {
    return { ok: false, reason: "filename" };
  }
  const dot = input.name.lastIndexOf(".");
  if (dot <= 0) return { ok: false, reason: "filename" };
  const extension = input.name.slice(dot + 1).toLowerCase();
  const format = Object.entries(formats).find(([key]) => key === extension)?.[1];
  if (!format || input.mimeType !== format.mime
    || !format.signature.every((byte, index) => input.bytes[index] === byte)) {
    return { ok: false, reason: "type" };
  }
  return { ok: true };
}
