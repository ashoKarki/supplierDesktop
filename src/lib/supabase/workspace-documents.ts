import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { documentStatuses } from "@/domain/document-state";
import type { Database } from "@/lib/supabase/database.types";

const suppliersSchema = z.array(z.object({ id: z.string().uuid(), name: z.string(), archived_at: z.string().nullable() }));
const requirementsSchema = z.array(z.object({ id: z.string().uuid(), name: z.string() }));
const requestsSchema = z.array(z.object({ id: z.string().uuid(), supplier_id: z.string().uuid(), created_at: z.string(), deadline: z.iso.date().nullable() }));
const itemsSchema = z.array(z.object({
  id: z.string().uuid(),
  request_id: z.string().uuid(),
  requirement_id: z.string().uuid(),
  status: z.enum(documentStatuses).exclude(["superseded"]),
  expires_on: z.string().nullable(),
}));

export async function loadWorkspaceDocuments(client: SupabaseClient<Database>, companyId: string) {
  const { data, error } = await client.rpc("workspace_document_snapshot", { target_company: companyId });
  if (error) {
    console.error("Workspace document snapshot failed", { code: error.code });
    throw new Error("Unable to load dashboard");
  }
  return z.object({
    suppliers: suppliersSchema,
    requirements: requirementsSchema,
    requests: requestsSchema,
    items: itemsSchema,
  }).parse(data);
}
