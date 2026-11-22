"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isLocalNoopScannerAllowed } from "@/domain/local-scanner";
import { getServerEnvironment } from "@/lib/env";
import { can } from "@/lib/security/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/require-user";
import { supplierRepository } from "@/lib/supabase/suppliers";
import { createDocumentRequest } from "@/services/requests";
import { storeDocument } from "@/services/document-uploads";

export async function addDocumentRequest(form: FormData) {
  const companyId = z.string().uuid().safeParse(form.get("companyId"));
  if (!companyId.success) throw new Error("Invalid workspace");
  const client = await createSupabaseServerClient();
  const user = await requireUser(client);
  const result = await createDocumentRequest({
    companyId: companyId.data,
    supplierId: form.get("supplierId"),
    requirementIds: form.getAll("requirementIds"),
  }, user.id, {
    roleFor: supplierRepository(client).roleFor,
    async create(id, supplierId, requirementIds) {
      const { error } = await client.rpc("create_document_request", {
        target_company: id,
        target_supplier: supplierId,
        requirement_ids: requirementIds,
      });
      if (error) {
        console.error("Document request creation failed", { code: error.code });
        throw new Error("Unable to create document request");
      }
    },
  });
  const path = `/workspace/${companyId.data}/requests`;
  if (!result.ok) {
    console.warn("Document request rejected", { reason: result.reason });
    redirect(`${path}?error=1`);
  }
  revalidatePath(path);
  redirect(path);
}

const itemFields = z.object({
  companyId: z.string().uuid(),
  itemId: z.string().uuid(),
});

export async function uploadDocument(form: FormData) {
  const fields = itemFields.safeParse(Object.fromEntries(form.entries()));
  if (!fields.success) throw new Error("Invalid document request");
  const { companyId, itemId } = fields.data;
  const path = `/workspace/${companyId}/requests`;
  const client = await createSupabaseServerClient();
  const user = await requireUser(client);
  const role = await supplierRepository(client).roleFor(user.id, companyId);
  if (!role || !can(role, "manage_requests")) {
    console.warn("Document upload denied");
    redirect(`${path}?error=permission`);
  }
  const { data: item, error: itemError } = await client.from("document_request_items")
    .select("id, status").eq("company_id", companyId).eq("id", itemId).maybeSingle();
  if (itemError) {
    console.error("Document request lookup failed", { code: itemError.code });
    throw new Error("Unable to load document request");
  }
  if (!item || !["requested", "rejected", "approved", "expired"].includes(item.status)) {
    console.warn("Document upload rejected: item unavailable or not accepting a version");
    redirect(`${path}?error=state`);
  }
  const result = await storeDocument({
    companyId,
    itemId,
    file: form.get("file"),
    expiresOn: form.get("expiresOn"),
    actor: { kind: "member", userId: user.id },
  });
  if (!result.ok) redirect(`${path}?error=${result.reason}`);
  revalidatePath(path);
  redirect(path);
}

export async function reviewDocument(form: FormData) {
  const fields = itemFields.extend({
    versionId: z.string().uuid(),
    nextStatus: z.enum(["under_review", "approved", "rejected"]),
    reason: z.string().max(2000),
    expiresOn: z.union([z.literal(""), z.iso.date()]),
  }).safeParse(Object.fromEntries(form.entries()));
  if (!fields.success) throw new Error("Invalid review details");
  const { companyId, itemId, versionId, nextStatus, reason, expiresOn } = fields.data;
  const path = `/workspace/${companyId}/requests`;
  const client = await createSupabaseServerClient();
  const user = await requireUser(client);
  const role = await supplierRepository(client).roleFor(user.id, companyId);
  if (!role || !can(role, "review_documents")) {
    console.warn("Document review denied");
    redirect(`${path}?error=permission`);
  }
  const { error } = await client.rpc("review_document", {
    target_company: companyId,
    target_item: itemId,
    target_version: versionId,
    next_status: nextStatus,
    decision_reason: reason || null,
    revised_expiry: expiresOn || null,
  });
  if (error) {
    console.error("Document review failed", { code: error.code });
    if (["22023", "40001", "42501"].includes(error.code)) redirect(`${path}?error=review`);
    throw new Error("Unable to review document");
  }
  revalidatePath(path);
  redirect(path);
}

export type SupplierLinkState = { url?: string; error?: string };

export async function createSupplierLink(_previous: SupplierLinkState, form: FormData): Promise<SupplierLinkState> {
  const fields = z.object({ companyId: z.string().uuid(), requestId: z.string().uuid() })
    .safeParse(Object.fromEntries(form.entries()));
  if (!fields.success) return { error: "Invalid request." };
  const client = await createSupabaseServerClient();
  const user = await requireUser(client);
  const role = await supplierRepository(client).roleFor(user.id, fields.data.companyId);
  if (!role || !can(role, "manage_requests")) {
    console.warn("Supplier link creation denied");
    return { error: "You do not have permission to create a link." };
  }
  if (!isLocalNoopScannerAllowed({
    nodeEnv: process.env.NODE_ENV,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    scanner: process.env.DOCUMENT_SCANNER,
  }) || !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    console.error("Supplier link creation disabled: document uploads are not configured");
    return { error: "Document uploads are not configured. Do not send a supplier link yet." };
  }
  const { data: token, error } = await client.rpc("create_supplier_upload_link", {
    target_company: fields.data.companyId,
    target_request: fields.data.requestId,
  });
  if (error || !token) {
    console.error("Supplier link creation failed", { code: error?.code });
    return { error: "Unable to create the supplier link." };
  }
  revalidatePath(`/workspace/${fields.data.companyId}/requests`);
  return { url: `${getServerEnvironment().SITE_URL}/supplier/upload/${token}` };
}

export async function revokeSupplierLink(form: FormData) {
  const fields = z.object({ companyId: z.string().uuid(), linkId: z.string().uuid() })
    .safeParse(Object.fromEntries(form.entries()));
  if (!fields.success) throw new Error("Invalid supplier link");
  const { companyId, linkId } = fields.data;
  const path = `/workspace/${companyId}/requests`;
  const client = await createSupabaseServerClient();
  const user = await requireUser(client);
  const role = await supplierRepository(client).roleFor(user.id, companyId);
  if (!role || !can(role, "manage_requests")) {
    console.warn("Supplier link revocation denied");
    redirect(`${path}?error=permission`);
  }
  const { error } = await client.rpc("revoke_supplier_upload_link", {
    target_company: companyId,
    target_link: linkId,
  });
  if (error) {
    console.error("Supplier link revocation failed", { code: error.code });
    throw new Error("Unable to revoke supplier link");
  }
  revalidatePath(path);
  redirect(path);
}
