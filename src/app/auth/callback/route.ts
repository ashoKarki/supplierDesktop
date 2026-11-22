import { NextResponse, type NextRequest } from "next/server";
import { connection } from "next/server";
import { getServerEnvironment } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  await connection();
  const env = getServerEnvironment();
  const code = request.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/register/verification-error", env.SITE_URL));

  const client = await createSupabaseServerClient();
  const { error: authError } = await client.auth.exchangeCodeForSession(code);
  if (authError) {
    console.error("Verification callback failed", { code: authError.code });
    return NextResponse.redirect(new URL("/register/verification-error", env.SITE_URL));
  }

  const { error: workspaceError } = await client.rpc("create_owner_workspace");
  if (workspaceError) {
    console.error("Workspace provisioning failed", { code: workspaceError.code });
    return NextResponse.redirect(new URL("/register/verification-error", env.SITE_URL));
  }
  return NextResponse.redirect(new URL("/workspace", env.SITE_URL));
}
