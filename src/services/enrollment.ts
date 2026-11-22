import { registrationSchema } from "../domain/registration";

type SignUpInput = {
  email: string;
  password: string;
  emailRedirectTo: string;
  metadata: {
    enrollment_type: "owner";
    administrator_name: string;
    company_name: string;
    country: string;
    business_details: string;
  };
};

export interface EnrollmentAuth {
  signUp(input: SignUpInput): Promise<{ error: string | null; hasSession: boolean }>;
  signOut(): Promise<void>;
}

export type EnrollmentResult =
  | { ok: true }
  | { ok: false; reason: "invalid" | "unavailable" | "verification_required" };

export async function enrollCompany(
  input: unknown,
  siteOrigin: string,
  auth: EnrollmentAuth,
): Promise<EnrollmentResult> {
  const parsed = registrationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };

  const registration = parsed.data;
  const result = await auth.signUp({
    email: registration.email,
    password: registration.password,
    emailRedirectTo: `${siteOrigin}/auth/callback`,
    metadata: {
      enrollment_type: "owner",
      administrator_name: registration.administratorName,
      company_name: registration.companyName,
      country: registration.country,
      business_details: registration.businessDetails,
    },
  });

  if (result.error) return { ok: false, reason: "unavailable" };
  if (result.hasSession) {
    await auth.signOut();
    return { ok: false, reason: "verification_required" };
  }
  return { ok: true };
}
