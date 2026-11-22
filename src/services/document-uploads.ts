import "server-only";

import { z } from "zod";
import { MAX_DOCUMENT_BYTES, validateDocumentUpload } from "@/domain/document-upload";
import { isLocalNoopScannerAllowed } from "@/domain/local-scanner";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

type UploadActor =
  | { kind: "member"; userId: string }
  | { kind: "supplier"; linkHash: string };

export async function storeDocument(input: {
  companyId: string;
  itemId: string;
  file: FormDataEntryValue | null;
  expiresOn: FormDataEntryValue | null;
  actor: UploadActor;
}): Promise<{ ok: true } | { ok: false; reason: "upload" | "scanner" | "storage" | "state" }> {
  const expiry = z.union([z.literal(""), z.iso.date()]).safeParse(input.expiresOn);
  if (!(input.file instanceof File) || input.file.size === 0 || input.file.size > MAX_DOCUMENT_BYTES || !expiry.success) {
    console.warn("Document upload rejected: invalid file size or expiry");
    return { ok: false, reason: "upload" };
  }
  const bytes = new Uint8Array(await input.file.arrayBuffer());
  const validated = validateDocumentUpload({ name: input.file.name, mimeType: input.file.type, bytes });
  if (!validated.ok) {
    console.warn("Document upload rejected", { reason: validated.reason });
    return { ok: false, reason: "upload" };
  }
  if (!isLocalNoopScannerAllowed({
    nodeEnv: process.env.NODE_ENV,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    scanner: process.env.DOCUMENT_SCANNER,
  })) {
    console.error("Document upload disabled: no configured production scanner");
    return { ok: false, reason: "scanner" };
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    console.error("Document upload disabled: storage service key is missing");
    return { ok: false, reason: "storage" };
  }

  const service = createSupabaseServiceClient();
  const versionId = crypto.randomUUID();
  const objectPath = `${input.companyId}/${input.itemId}/${versionId}`;
  const bucket = service.storage.from("supplierdesk-documents");
  const uploaded = await bucket.upload(objectPath, bytes, { contentType: input.file.type, upsert: false });
  if (uploaded.error) {
    console.error("Document storage upload failed", { code: uploaded.error.name });
    const cleanup = await bucket.remove([objectPath]);
    if (cleanup.error) console.error("Document storage cleanup failed", { code: cleanup.error.name });
    return { ok: false, reason: "storage" };
  }
  const details = {
    target_company: input.companyId,
    target_item: input.itemId,
    new_version: versionId,
    file_name: input.file.name,
    media_type: input.file.type,
    file_size: bytes.length,
    expiration: expiry.data || null,
  };
  const recorded = input.actor.kind === "member"
    ? await service.rpc("record_document_upload", { ...details, submitted_by: input.actor.userId })
    : await service.rpc("record_supplier_document_upload", { ...details, link_hash: input.actor.linkHash });
  if (recorded.error) {
    console.error("Document version recording failed", { code: recorded.error.code, versionId });
    if (["22023", "42501", "40001"].includes(recorded.error.code)) {
      const cleanup = await bucket.remove([objectPath]);
      if (cleanup.error) console.error("Document storage cleanup failed", { code: cleanup.error.name, versionId });
      return { ok: false, reason: "state" };
    }
    console.error("Document object requires reconciliation; database outcome may be unknown", { versionId });
    return { ok: false, reason: "storage" };
  }
  return { ok: true };
}
