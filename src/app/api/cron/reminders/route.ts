import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { isLocalNoopScannerAllowed } from "@/domain/local-scanner";
import { resendEmailProvider } from "@/lib/email/resend";
import { getServerEnvironment } from "@/lib/env";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { processDueReminders } from "@/services/reminder-worker";

function isAuthorized(request: Request, secret: string | undefined) {
  const supplied = request.headers.get("x-reminder-secret");
  if (!secret || Buffer.byteLength(secret) < 32 || !supplied) return false;
  const expectedBuffer = Buffer.from(secret);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length && timingSafeEqual(expectedBuffer, suppliedBuffer);
}

export async function POST(request: Request) {
  if (!isAuthorized(request, process.env.REMINDER_CRON_SECRET)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const settings = z.object({
    RESEND_API_KEY: z.string().min(1),
    RESEND_FROM_EMAIL: z.string().email(),
    REMINDER_LINK_SECRET: z.string().min(32),
  }).safeParse(process.env);
  if (!settings.success) {
    console.error("Reminder worker is missing required email or link settings");
    return new Response("Reminder worker is not configured", { status: 503 });
  }
  if (!isLocalNoopScannerAllowed({
    nodeEnv: process.env.NODE_ENV,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    scanner: process.env.DOCUMENT_SCANNER,
  })) {
    console.error("Reminder worker is disabled without an enabled document scanner");
    return new Response("Reminder worker is not available", { status: 503 });
  }

  try {
    const service = createSupabaseServiceClient();
    const result = await processDueReminders(getServerEnvironment().SITE_URL, {
      async enqueue() {
        const { data, error } = await service.rpc("enqueue_due_reminders");
        if (error) {
          console.error("Reminder enqueue failed", { code: error.code });
          throw new Error("Unable to enqueue reminders");
        }
        return data;
      },
      async claim(batchSize) {
        const { data, error } = await service.rpc("claim_due_reminders", { batch_size: batchSize });
        if (error) {
          console.error("Reminder claim failed", { code: error.code });
          throw new Error("Unable to claim reminders");
        }
        return data;
      },
      supplierToken(deliveryId) {
        return createHmac("sha256", settings.data.REMINDER_LINK_SECRET)
          .update(`supplierdesk-reminder:${deliveryId}`)
          .digest("hex");
      },
      async createSupplierLink(deliveryId, token) {
        const { data, error } = await service.rpc("create_reminder_supplier_upload_link", {
          delivery_id: deliveryId,
          token,
        });
        if (error) {
          console.error("Reminder upload link creation failed", { code: error.code });
          throw new Error("Unable to create reminder upload link");
        }
        return data;
      },
      async complete(deliveryId, outcome, reason) {
        const { error } = await service.rpc("complete_reminder_delivery", {
          delivery_id: deliveryId,
          outcome,
          ...(reason ? { failure_reason: reason } : {}),
        });
        if (error) {
          console.error("Reminder delivery update failed", { code: error.code, outcome });
          throw new Error("Unable to update reminder delivery");
        }
      },
      email: resendEmailProvider(settings.data.RESEND_API_KEY, settings.data.RESEND_FROM_EMAIL),
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Reminder worker request failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return new Response("Reminder worker failed", { status: 500 });
  }
}
