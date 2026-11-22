import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import { createSupabaseServiceClient } from "./service";

const tokenSchema = z.string().regex(/^[0-9a-f]{64}$/);

export async function findSupplierLink(token: string) {
  if (!tokenSchema.safeParse(token).success) return null;
  const linkHash = createHash("sha256").update(token).digest("hex");
  const { data, error } = await createSupabaseServiceClient().rpc("resolve_supplier_upload_link", { link_hash: linkHash });
  if (error) {
    console.error("Supplier link lookup failed", { code: error.code });
    throw new Error("Unable to check supplier link");
  }
  const link = data[0];
  return link ? { ...link, linkHash } : null;
}
