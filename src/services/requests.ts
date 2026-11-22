import { z } from "zod";
import { can, type Role } from "../lib/security/permissions";

const requestSchema = z.object({
  companyId: z.string().uuid(),
  supplierId: z.string().uuid(),
  requirementIds: z.array(z.string().uuid()).min(1).max(100)
    .refine((ids) => new Set(ids).size === ids.length),
});

export interface RequestRepository {
  roleFor(userId: string, companyId: string): Promise<Role | null>;
  create(companyId: string, supplierId: string, requirementIds: string[]): Promise<void>;
}

export async function createDocumentRequest(
  input: unknown,
  userId: string,
  repository: RequestRepository,
): Promise<{ ok: true } | { ok: false; reason: "invalid" | "forbidden" }> {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const { companyId, supplierId, requirementIds } = parsed.data;
  const role = await repository.roleFor(userId, companyId);
  if (!role || !can(role, "manage_requests")) return { ok: false, reason: "forbidden" };
  await repository.create(companyId, supplierId, requirementIds);
  return { ok: true };
}
