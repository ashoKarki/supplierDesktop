"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/require-user";
import { supplierRepository } from "@/lib/supabase/suppliers";
import { updateCompanyProfile } from "@/services/company-profile";

export async function saveCompanyProfile(form: FormData) {
  const companyId = z.string().uuid().safeParse(form.get("companyId"));
  if (!companyId.success) throw new Error("Invalid workspace");
  const client = await createSupabaseServerClient();
  const user = await requireUser(client);
  const result = await updateCompanyProfile(Object.fromEntries(form.entries()), user.id, {
    roleFor: supplierRepository(client).roleFor,
    async update(id, profile) {
      const { data, error } = await client.from("companies").update({
        name: profile.companyName,
        country: profile.country,
        business_details: profile.businessDetails,
      }).eq("id", id).select("id").maybeSingle();
      if (error) {
        console.error("Company profile update failed", { code: error.code });
        throw new Error("Unable to update company profile");
      }
      return data !== null;
    },
  });
  const path = `/workspace/${companyId.data}/settings`;
  if (!result.ok) {
    console.warn("Company profile update rejected", { reason: result.reason });
    redirect(`${path}?error=1`);
  }
  revalidatePath("/workspace", "layout");
  redirect(`${path}?saved=1`);
}
