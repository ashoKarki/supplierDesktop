import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/lib/supabase/database.types";
import type { ReportKind } from "@/services/report-tables";

const reportPageSchema = z.object({
  total: z.number().int().nonnegative(),
  rows: z.array(z.unknown()),
});

export async function loadWorkspaceReportPage(
  client: SupabaseClient<Database>,
  companyId: string,
  kind: ReportKind,
  page: number,
  pageSize = 50,
) {
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 10_000) {
    throw new Error("Invalid report page");
  }
  const { data, error } = await client.rpc("workspace_report_page", {
    target_company: companyId,
    requested_kind: kind,
    page_size: pageSize,
    page_offset: (page - 1) * pageSize,
  });
  if (error) {
    console.error("Workspace report page failed", { code: error.code, kind });
    throw new Error("Unable to load report");
  }
  return reportPageSchema.parse(data);
}
