import { z } from "zod";

const credentialsSchema = z.object({
  email: z.string().trim().max(254).email().toLowerCase(),
  password: z.string().min(1).max(128),
});

interface OwnerAuth {
  signIn(email: string, password: string): Promise<boolean>;
  provision(): Promise<boolean>;
}

export async function signInOwner(input: unknown, auth: OwnerAuth): Promise<{ ok: boolean }> {
  const credentials = credentialsSchema.safeParse(input);
  if (!credentials.success) return { ok: false };
  if (!(await auth.signIn(credentials.data.email, credentials.data.password))) return { ok: false };
  return { ok: await auth.provision() };
}
