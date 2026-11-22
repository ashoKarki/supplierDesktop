"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/supabase/require-user";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supplierRepository } from "@/lib/supabase/suppliers";
import { manageSupplier } from "@/services/suppliers";

export async function updateSupplier(form: FormData) {
  const rawCompanyId = form.get("companyId");
  const companyId = z.string().uuid().safeParse(rawCompanyId);
  if (!companyId.success) throw new Error("Invalid workspace");

  const client = await createSupabaseServerClient();
  const user = await requireUser(client);
  const result = await manageSupplier(Object.fromEntries(form.entries()), user.id, supplierRepository(client));
  const path = `/workspace/${companyId.data}`;
  if (!result.ok) {
    console.warn("Supplier change rejected", { reason: result.reason });
    redirect(`${path}?error=${result.reason}`);
  }
  revalidatePath(path);
  redirect(path);
}
