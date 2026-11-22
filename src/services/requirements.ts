import { z } from "zod";
import { documentRequirementSchema } from "../domain/document-requirement";
import { can, type Role } from "../lib/security/permissions";

const formSchema = z.object({
  companyId: z.string().uuid(),
  name: z.string(),
  renewalMonths: z.string().regex(/^[1-9]\d{0,2}$/).transform(Number),
}).pipe(documentRequirementSchema.extend({ companyId: z.string().uuid() }));

export interface RequirementRepository {
  roleFor(userId: string, companyId: string): Promise<Role | null>;
  create(companyId: string, requirement: { name: string; renewalMonths: number }): Promise<void>;
}

export async function createRequirement(
  input: unknown,
  userId: string,
  repository: RequirementRepository,
): Promise<{ ok: true } | { ok: false; reason: "invalid" | "forbidden" }> {
  const parsed = formSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const role = await repository.roleFor(userId, parsed.data.companyId);
  if (!role || !can(role, "manage_requirements")) return { ok: false, reason: "forbidden" };
  await repository.create(parsed.data.companyId, {
    name: parsed.data.name,
    renewalMonths: parsed.data.renewalMonths,
  });
  return { ok: true };
}
