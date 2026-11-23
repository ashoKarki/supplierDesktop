import { z } from "zod";
import type { EmailProvider } from "@/lib/email/provider";

const reminderJobSchema = z.object({
  id: z.string().uuid(),
  company_id: z.string().uuid(),
  request_id: z.string().uuid(),
  item_id: z.string().uuid().nullable(),
  recipient_email: z.string().email(),
  recipient_kind: z.enum(["supplier", "staff"]),
  reminder_kind: z.enum([
    "deadline_7_days",
    "deadline_1_day_overdue",
    "expiry_90_days",
    "expiry_60_days",
    "expiry_30_days",
    "expiry_7_days",
  ]),
  scheduled_on: z.iso.date(),
  attempt: z.number().int().positive(),
  company_name: z.string(),
  supplier_name: z.string(),
  deadline: z.iso.date().nullable(),
  requirement_name: z.string().nullable(),
  expires_on: z.iso.date().nullable(),
});

export type ReminderJob = z.infer<typeof reminderJobSchema>;

type ReminderDependencies = {
  enqueue(): Promise<unknown>;
  claim(batchSize: number): Promise<unknown>;
  supplierToken(deliveryId: string): string;
  createSupplierLink(deliveryId: string, token: string): Promise<string | null>;
  complete(deliveryId: string, outcome: "sent" | "failed" | "skipped", reason?: string): Promise<void>;
  email: EmailProvider;
};

function messageFor(job: ReminderJob, uploadUrl: string | null) {
  if (job.reminder_kind.startsWith("deadline_")) {
    const overdue = job.reminder_kind === "deadline_1_day_overdue";
    const subject = overdue
      ? "SupplierDesk: document request is overdue"
      : "SupplierDesk: document request due soon";
    const details = overdue
      ? `The document request for ${job.supplier_name} was due on ${job.deadline ?? "the stated deadline"}.`
      : `The document request for ${job.supplier_name} is due on ${job.deadline ?? "the stated deadline"}.`;
    const text = job.recipient_kind === "supplier"
      ? `${job.company_name} ${overdue ? "is following up on" : "reminds you about"} its document request. ${details}\n\nSubmit the requested documents here:\n${uploadUrl ?? ""}`
      : `${job.company_name}: ${details}`;
    return { subject, text };
  }

  const days = {
    deadline_7_days: 7,
    deadline_1_day_overdue: 1,
    expiry_90_days: 90,
    expiry_60_days: 60,
    expiry_30_days: 30,
    expiry_7_days: 7,
  }[job.reminder_kind];
  const subject = `SupplierDesk: document expires in ${days} days`;
  const document = job.requirement_name ?? "A required document";
  const details = `${document} for ${job.supplier_name} expires on ${job.expires_on ?? "the stated date"}.`;
  const text = job.recipient_kind === "supplier"
    ? `${job.company_name} ${days === 7 ? "reminds you" : "notifies you"} that ${details}\n\nSubmit a replacement document here:\n${uploadUrl ?? ""}`
    : `${job.company_name}: ${details}`;
  return { subject, text };
}

export async function processDueReminders(siteOrigin: string, deps: ReminderDependencies) {
  const origin = new URL(siteOrigin).origin;
  await deps.enqueue();
  const jobs = z.array(reminderJobSchema).parse(await deps.claim(10));
  const result = { claimed: jobs.length, sent: 0, skipped: 0, failed: 0 };

  for (const job of jobs) {
    try {
      let uploadUrl: string | null = null;
      if (job.recipient_kind === "supplier") {
        const token = deps.supplierToken(job.id);
        const issuedToken = await deps.createSupplierLink(job.id, token);
        if (!issuedToken) {
          await deps.complete(job.id, "skipped");
          result.skipped++;
          continue;
        }
        if (issuedToken !== token) throw new Error("Reminder upload token did not match");
        const validToken = z.string().regex(/^[0-9a-f]{64}$/).parse(issuedToken);
        uploadUrl = `${origin}/supplier/upload/${validToken}?lang=en`;
      }

      const message = messageFor(job, uploadUrl);
      await deps.email.send({
        to: job.recipient_email,
        ...message,
        idempotencyKey: `supplierdesk-reminder-${job.id}`,
      });
      await deps.complete(job.id, "sent");
      result.sent++;
    } catch (error) {
      console.error("Reminder delivery failed", {
        deliveryId: job.id,
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
      await deps.complete(job.id, "failed", "delivery_failed");
      result.failed++;
    }
  }

  return result;
}
