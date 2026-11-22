import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getServerEnvironment } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

export async function proxy(request: NextRequest) {
  const env = getServerEnvironment();
  let response = NextResponse.next({ request });
  const client = createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });
  const { error } = await client.auth.getUser();
  if (error && error.name !== "AuthSessionMissingError") {
    console.error("Session refresh failed", { code: error.code });
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = { matcher: ["/workspace/:path*"] };
