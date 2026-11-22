"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { findSupplierLink } from "@/lib/supabase/supplier-links";
import { storeDocument } from "@/services/document-uploads";

export async function uploadSupplierDocument(form: FormData) {
  const parsed = z.object({
    token: z.string().regex(/^[0-9a-f]{64}$/),
    itemId: z.string().uuid(),
  }).safeParse(Object.fromEntries(form.entries()));
  if (!parsed.success) notFound();
  const { token, itemId } = parsed.data;
  const link = await findSupplierLink(token);
  if (!link) notFound();
  const result = await storeDocument({
    companyId: link.company_id,
    itemId,
    file: form.get("file"),
    expiresOn: form.get("expiresOn"),
    actor: { kind: "supplier", linkHash: link.linkHash },
  });
  const path = `/supplier/upload/${token}`;
  if (!result.ok) redirect(`${path}?error=${result.reason}`);
  revalidatePath(`/workspace/${link.company_id}/requests`);
  revalidatePath(path);
  redirect(`${path}?uploaded=1`);
}
