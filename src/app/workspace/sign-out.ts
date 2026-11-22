"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function signOut() {
  const client = await createSupabaseServerClient();
  const { error } = await client.auth.signOut();
  if (error) {
    console.error("Sign-out failed", { code: error.code });
    throw new Error("Unable to sign out");
  }
  redirect("/");
}
