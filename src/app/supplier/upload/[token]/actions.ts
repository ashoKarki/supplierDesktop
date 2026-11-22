"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { portalLocale } from "@/i18n/supplier-portal";
import { findSupplierLink } from "@/lib/supabase/supplier-links";
import { storeDocument } from "@/services/document-uploads";

export async function uploadSupplierDocument(form: FormData) {
  const rawToken = form.get("token");
  const token = typeof rawToken === "string" ? rawToken : "";
  const locale = portalLocale(form.get("lang"));
  const link = await findSupplierLink(token);
  if (!link) notFound();
  const itemId = z.string().uuid().safeParse(form.get("itemId"));
  if (!itemId.success) {
    console.warn("Supplier document item rejected");
    notFound();
  }
  const result = await storeDocument({
    companyId: link.company_id,
    itemId: itemId.data,
    file: form.get("file"),
    expiresOn: form.get("expiresOn"),
    actor: { kind: "supplier", linkHash: link.linkHash },
  });
  const path = `/supplier/upload/${token}`;
  if (!result.ok) redirect(`${path}?lang=${locale}&error=${result.reason}`);
  revalidatePath(`/workspace/${link.company_id}/requests`);
  revalidatePath(path);
  redirect(`${path}?lang=${locale}&uploaded=1`);
}
