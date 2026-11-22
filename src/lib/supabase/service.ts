import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getServerEnvironment } from "@/lib/env";
import type { Database } from "./database.types";

export function createSupabaseServiceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key?.trim()) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for document storage");
  return createClient<Database>(getServerEnvironment().NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
