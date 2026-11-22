import { z } from "zod";
import { registrationSchema } from "../domain/registration";
import { can, type Role } from "../lib/security/permissions";

const companyProfileSchema = registrationSchema.pick({
  companyName: true,
  country: true,
  businessDetails: true,
});
const inputSchema = companyProfileSchema.extend({ companyId: z.string().uuid() });

type CompanyProfile = z.infer<typeof companyProfileSchema>;

export interface CompanyProfileRepository {
  roleFor(userId: string, companyId: string): Promise<Role | null>;
  update(companyId: string, profile: CompanyProfile): Promise<boolean>;
}

export async function updateCompanyProfile(
  input: unknown,
  userId: string,
  repository: CompanyProfileRepository,
): Promise<{ ok: true } | { ok: false; reason: "invalid" | "forbidden" | "not_found" }> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const { companyId, ...profile } = parsed.data;
  const role = await repository.roleFor(userId, companyId);
  if (!role || !can(role, "manage_company")) return { ok: false, reason: "forbidden" };
  return await repository.update(companyId, profile)
    ? { ok: true }
    : { ok: false, reason: "not_found" };
}
