import { z } from "zod";
import { can, type Role } from "../lib/security/permissions";

const companyId = z.string().uuid();
const supplierId = z.string().uuid();
const name = z.string().trim().min(1).max(200);
const mutationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), companyId, name }),
  z.object({ action: z.literal("rename"), companyId, supplierId, name }),
  z.object({ action: z.literal("archive"), companyId, supplierId }),
]);

export interface SupplierRepository {
  roleFor(userId: string, companyId: string): Promise<Role | null>;
  create(companyId: string, name: string): Promise<boolean>;
  rename(companyId: string, supplierId: string, name: string): Promise<boolean>;
  archive(companyId: string, supplierId: string): Promise<boolean>;
}

export type SupplierResult =
  | { ok: true }
  | { ok: false; reason: "invalid" | "forbidden" | "not_found" };

export async function manageSupplier(
  input: unknown,
  userId: string,
  repository: SupplierRepository,
): Promise<SupplierResult> {
  const parsed = mutationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const mutation = parsed.data;
  const role = await repository.roleFor(userId, mutation.companyId);
  if (!role || !can(role, "manage_suppliers")) return { ok: false, reason: "forbidden" };

  let changed: boolean;
  if (mutation.action === "create") {
    changed = await repository.create(mutation.companyId, mutation.name);
  } else if (mutation.action === "rename") {
    changed = await repository.rename(mutation.companyId, mutation.supplierId, mutation.name);
  } else {
    changed = await repository.archive(mutation.companyId, mutation.supplierId);
  }
  return changed ? { ok: true } : { ok: false, reason: "not_found" };
}
