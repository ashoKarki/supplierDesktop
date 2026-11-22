import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ companyId: string; versionId: string }> },
) {
  const parsed = z.object({ companyId: z.string().uuid(), versionId: z.string().uuid() }).safeParse(await params);
  if (!parsed.success) return new Response("Not found", { status: 404 });
  const client = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError && authError.name !== "AuthSessionMissingError") {
    console.error("Document authentication check failed", { code: authError.code });
    return new Response("Unable to authenticate", { status: 500 });
  }
  if (!user) return new Response("Authentication required", { status: 401 });
  const { data: version, error } = await client.from("document_versions")
    .select("storage_path, filename").eq("company_id", parsed.data.companyId)
    .eq("id", parsed.data.versionId).maybeSingle();
  if (error) {
    console.error("Document lookup failed", { code: error.code });
    return new Response("Unable to load document", { status: 500 });
  }
  if (!version) return new Response("Not found", { status: 404 });
  const { data, error: storageError } = await createSupabaseServiceClient().storage
    .from("supplierdesk-documents").download(version.storage_path);
  if (storageError || !data) {
    console.error("Document download failed", { code: storageError?.name });
    return new Response("Unable to download document", { status: 500 });
  }
  const filename = encodeURIComponent(version.filename).replace(/['()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return new Response(data, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="document"; filename*=UTF-8''${filename}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": "sandbox",
    },
  });
}
