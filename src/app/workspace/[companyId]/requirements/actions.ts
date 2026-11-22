"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/require-user";
import { supplierRepository } from "@/lib/supabase/suppliers";
import { createRequirement } from "@/services/requirements";

export async function addRequirement(form: FormData) {
  const companyId = z.string().uuid().safeParse(form.get("companyId"));
  if (!companyId.success) throw new Error("Invalid workspace");
  const client = await createSupabaseServerClient();
  const user = await requireUser(client);
  const result = await createRequirement(Object.fromEntries(form.entries()), user.id, {
    roleFor: supplierRepository(client).roleFor,
    async create(id, requirement) {
      const { error } = await client.from("document_requirements").insert({
        company_id: id,
        name: requirement.name,
        renewal_months: requirement.renewalMonths,
      });
      if (error) {
        console.error("Requirement creation failed", { code: error.code });
        throw new Error("Unable to create requirement");
      }
    },
  });
  const path = `/workspace/${companyId.data}/requirements`;
  if (!result.ok) {
    console.warn("Requirement creation rejected", { reason: result.reason });
    redirect(`${path}?error=1`);
  }
  revalidatePath(path);
  redirect(path);
}
