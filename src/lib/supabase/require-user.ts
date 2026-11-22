import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import type { Database } from "./database.types";

export async function requireUser(client: SupabaseClient<Database>) {
  const { data: { user }, error } = await client.auth.getUser();
  if (error && error.name !== "AuthSessionMissingError") {
    console.error("Authentication check failed", { code: error.code });
  }
  if (error || !user) redirect("/sign-in");
  return user;
}
