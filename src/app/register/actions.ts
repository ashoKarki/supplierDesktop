"use server";

import { redirect } from "next/navigation";
import { getServerEnvironment } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { enrollCompany, type EnrollmentResult } from "@/services/enrollment";

export async function register(
  _previous: EnrollmentResult | null,
  form: FormData,
): Promise<EnrollmentResult> {
  const client = await createSupabaseServerClient();
  const env = getServerEnvironment();
  const result = await enrollCompany(
    Object.fromEntries(form.entries()),
    env.SITE_URL,
    {
      async signUp(input) {
        const { data, error } = await client.auth.signUp({
          email: input.email,
          password: input.password,
          options: {
            emailRedirectTo: input.emailRedirectTo,
            data: input.metadata,
          },
        });
        if (error) console.error("Enrollment signup failed", { code: error.code });
        return { error: error?.code ?? (error ? "auth_error" : null), hasSession: !!data.session };
      },
      async signOut() {
        const { error } = await client.auth.signOut();
        if (error) {
          console.error("Enrollment sign-out failed", { code: error.code });
          throw new Error("Unable to end unverified session");
        }
      },
    },
  );
  if (!result.ok) {
    if (result.reason === "verification_required") {
      console.error("Supabase email confirmation must be enabled");
    }
    return result;
  }
  redirect("/register/check-email");
}
