"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signInOwner } from "@/services/owner-sign-in";

export async function signIn(
  _previous: { ok: boolean } | null,
  form: FormData,
): Promise<{ ok: boolean }> {
  const client = await createSupabaseServerClient();
  const result = await signInOwner(Object.fromEntries(form.entries()), {
    async signIn(email, password) {
      const { error } = await client.auth.signInWithPassword({ email, password });
      if (error) console.error("Owner sign-in failed", { code: error.code });
      return !error;
    },
    async provision() {
      const { error } = await client.rpc("create_owner_workspace");
      if (error) console.error("Workspace provisioning failed", { code: error.code });
      return !error;
    },
  });
  if (!result.ok) return result;
  redirect("/workspace");
}
