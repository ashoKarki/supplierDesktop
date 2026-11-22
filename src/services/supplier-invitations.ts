import { z } from "zod";
import type { EmailProvider } from "../lib/email/provider";

const invitationSchema = z.object({
  companyId: z.string().uuid(),
  requestId: z.string().uuid(),
  email: z.string().trim().max(254).email().toLowerCase(),
  language: z.enum(["en", "de"]),
});

type InvitationDependencies = {
  authorized(companyId: string): Promise<string | null>;
  issue(companyId: string, requestId: string): Promise<string>;
  revoke(companyId: string, token: string): Promise<void>;
  email: EmailProvider;
};

export async function sendSupplierInvitation(
  input: unknown,
  siteOrigin: string,
  deps: InvitationDependencies,
): Promise<{ ok: true } | { ok: false; reason: "invalid" | "forbidden" | "delivery" }> {
  const parsed = invitationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const { companyId, requestId, email, language } = parsed.data;
  const companyName = await deps.authorized(companyId);
  if (!companyName) return { ok: false, reason: "forbidden" };
  const token = z.string().regex(/^[0-9a-f]{64}$/).parse(await deps.issue(companyId, requestId));
  const url = `${siteOrigin}/supplier/upload/${token}?lang=${language}`;
  const subject = language === "de" ? "SupplierDesk: Dokumente angefordert" : "SupplierDesk: documents requested";
  const text = language === "de"
    ? `${companyName} hat Dokumente von Ihnen angefordert. Öffnen Sie diesen vertraulichen Link, um sie einzureichen:\n\n${url}\n\nDer Link ist sieben Tage gültig.`
    : `${companyName} has requested documents from you. Open this confidential link to submit them:\n\n${url}\n\nThe link is valid for seven days.`;
  try {
    await deps.email.send({ to: email, subject, text });
  } catch {
    console.error("Supplier invitation delivery could not be confirmed");
    await deps.revoke(companyId, token);
    return { ok: false, reason: "delivery" };
  }
  return { ok: true };
}
