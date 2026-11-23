import { z } from "zod";
import { can } from "@/lib/security/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supplierRepository } from "@/lib/supabase/suppliers";
import { loadWorkspaceReportPage } from "@/lib/supabase/workspace-reports";
import { reportCsv } from "@/services/report-csv";
import { reportPdf, UnsupportedReportCharacters } from "@/services/report-pdf";
import { reportKinds, reportTableForRows } from "@/services/report-tables";

export async function GET(request: Request, { params }: { params: Promise<{ companyId: string; kind: string }> }) {
  const parsed = z.object({ companyId: z.string().uuid(), kind: z.enum(reportKinds) }).safeParse(await params);
  const format = z.enum(["csv", "pdf"]).safeParse(new URL(request.url).searchParams.get("format") ?? "csv");
  if (!parsed.success || !format.success) return new Response("Not found", { status: 404 });
  const client = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await client.auth.getUser();
  if (authError && authError.name !== "AuthSessionMissingError") {
    console.error("Report authentication failed", { code: authError.code });
    return new Response("Unable to authenticate", { status: 500 });
  }
  if (!user) return new Response("Authentication required", { status: 401 });
  const role = await supplierRepository(client).roleFor(user.id, parsed.data.companyId);
  if (!role || !can(role, "export_data")) return new Response("Not found", { status: 404 });
  const { data: company, error } = await client.from("companies")
    .select("id, name, time_zone").eq("id", parsed.data.companyId).maybeSingle();
  if (error) {
    console.error("Report workspace lookup failed", { code: error.code });
    return new Response("Unable to load report", { status: 500 });
  }
  if (!company) return new Response("Not found", { status: 404 });
  const exportLimit = format.data === "pdf" ? 2_000 : 10_000;
  const report = await loadWorkspaceReportPage(client, company.id, parsed.data.kind, 1, exportLimit);
  if (report.total > exportLimit || report.total > report.rows.length) {
    return new Response(`This report exceeds the ${exportLimit.toLocaleString("en-US")}-row export limit.`, { status: 413 });
  }
  const now = new Date();
  const table = reportTableForRows(parsed.data.kind, report.rows);
  let content: string | Uint8Array<ArrayBuffer>;
  if (format.data === "pdf") {
    try {
      content = new Uint8Array(await reportPdf(table, company.name, company.time_zone, now));
    } catch (error) {
      if (!(error instanceof UnsupportedReportCharacters)) throw error;
      console.warn("PDF report contains unsupported characters");
      return new Response("The PDF font cannot display some characters in this report. Use CSV export instead.", { status: 422 });
    }
  } else {
    content = reportCsv([table.headers, ...table.rows]);
  }
  return new Response(content, {
    headers: {
      "Content-Type": format.data === "pdf" ? "application/pdf" : "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${parsed.data.kind}-report.${format.data}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": "sandbox",
    },
  });
}
