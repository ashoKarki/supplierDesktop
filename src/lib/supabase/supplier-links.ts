import "server-only";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { z } from "zod";
import { supplierPortalIpKey } from "@/lib/security/supplier-portal-rate-limit";
import { createSupabaseServiceClient } from "./service";

const tokenSchema = z.string().regex(/^[0-9a-f]{64}$/);

export async function findSupplierLink(token: string) {
  const validToken = tokenSchema.safeParse(token).success;
  const linkHash = validToken ? createHash("sha256").update(token).digest("hex") : null;
  const requestHeaders = await headers();
  const ipKey = supplierPortalIpKey({
    nodeEnv: process.env.NODE_ENV,
    vercel: process.env.VERCEL,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    secret: process.env.SUPPLIER_PORTAL_RATE_SECRET,
    forwardedIp: requestHeaders.get("x-vercel-forwarded-for") ?? undefined,
  });
  const service = createSupabaseServiceClient();
  const limit = await service.rpc("consume_supplier_portal_limit", { ip_key: ipKey, token_key: linkHash });
  if (limit.error) {
    console.error("Supplier portal rate limit check failed", { code: limit.error.code });
    throw new Error("Unable to check supplier portal access");
  }
  if (!limit.data) {
    console.warn("Supplier portal access rate limited");
    return null;
  }
  if (!linkHash) {
    console.warn("Supplier portal token format rejected");
    return null;
  }
  const { data, error } = await service.rpc("resolve_supplier_upload_link", { link_hash: linkHash });
  if (error) {
    console.error("Supplier link lookup failed", { code: error.code });
    throw new Error("Unable to check supplier link");
  }
  const link = data[0];
  return link ? { ...link, linkHash } : null;
}
