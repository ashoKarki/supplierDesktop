import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { roles } from "@/lib/security/permissions";
import type { Database } from "@/lib/supabase/database.types";
import type { SupplierRepository } from "@/services/suppliers";

const roleSchema = z.object({ role: z.enum(roles) });

export function supplierRepository(client: SupabaseClient<Database>): SupplierRepository {
  return {
    async roleFor(userId, companyId) {
      const { data, error } = await client.from("company_memberships")
        .select("role").eq("company_id", companyId).eq("user_id", userId).maybeSingle();
      if (error) {
        console.error("Membership lookup failed", { code: error.code });
        throw new Error("Unable to check workspace permissions");
      }
      return data ? roleSchema.parse(data).role : null;
    },
    async create(companyId, name) {
      const { error } = await client.from("suppliers").insert({ company_id: companyId, name });
      if (error) {
        if (error.code === "P1001") return "limit_reached";
        console.error("Supplier creation failed", { code: error.code });
        throw new Error("Unable to create supplier");
      }
      return true;
    },
    async rename(companyId, supplierId, name) {
      const { data, error } = await client.from("suppliers").update({ name })
        .eq("company_id", companyId).eq("id", supplierId).select("id").maybeSingle();
      if (error) {
        console.error("Supplier update failed", { code: error.code });
        throw new Error("Unable to update supplier");
      }
      return data !== null;
    },
    async archive(companyId, supplierId) {
      const { data, error } = await client.from("suppliers").update({ archived_at: new Date().toISOString() })
        .eq("company_id", companyId).eq("id", supplierId).select("id").maybeSingle();
      if (error) {
        console.error("Supplier archive failed", { code: error.code });
        throw new Error("Unable to archive supplier");
      }
      return data !== null;
    },
    async updateContact(companyId, supplierId, email) {
      const { data, error } = await client.from("suppliers").update({ contact_email: email })
        .eq("company_id", companyId).eq("id", supplierId).is("archived_at", null).select("id").maybeSingle();
      if (error) {
        console.error("Supplier contact update failed", { code: error.code });
        throw new Error("Unable to update supplier contact");
      }
      return data !== null;
    },
  };
}
