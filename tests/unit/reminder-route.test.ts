import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), send: vi.fn() }));
vi.mock("@/lib/email/resend", () => ({
  resendEmailProvider: () => ({ send: mocks.send }),
}));
vi.mock("@/lib/env", () => ({
  getServerEnvironment: () => ({ SITE_URL: "https://supplierdesk.example" }),
}));
vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceClient: () => ({ rpc: mocks.rpc }),
}));

import { POST } from "../../src/app/api/cron/reminders/route";

const deliveryId = "431d80bd-f9c6-40c3-8da5-8e24cd473f06";

const job = {
  id: deliveryId,
  company_id: "a5866bdd-2990-49a7-af00-e1e2d29aee24",
  request_id: "77dabd73-bc96-471c-9a2c-f952935a9ee0",
  item_id: null,
  recipient_email: "supplier@example.test",
  recipient_kind: "supplier",
  reminder_kind: "deadline_7_days",
  scheduled_on: "2026-11-23",
  attempt: 1,
  company_name: "Example Manufacturer",
  supplier_name: "Example Supplier",
  deadline: "2026-11-30",
  requirement_name: null,
  expires_on: null,
};

function request(secret = "c".repeat(32)) {
  return new Request("https://supplierdesk.example/api/cron/reminders", {
    method: "POST",
    headers: { "x-reminder-secret": secret },
  });
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("DOCUMENT_SCANNER", "local-noop");
  vi.stubEnv("REMINDER_CRON_SECRET", "c".repeat(32));
  vi.stubEnv("REMINDER_LINK_SECRET", "l".repeat(32));
  vi.stubEnv("RESEND_API_KEY", "resend-key");
  vi.stubEnv("RESEND_FROM_EMAIL", "SupplierDesk@example.test");
  mocks.rpc.mockImplementation((name: string, args?: { token?: string }) => {
    if (name === "create_reminder_supplier_upload_link") {
      return Promise.resolve({ data: args?.token ?? null, error: null });
    }
    const responses: Record<string, { data: unknown; error: null }> = {
      enqueue_due_reminders: { data: 1, error: null },
      claim_due_reminders: { data: [job], error: null },
      complete_reminder_delivery: { data: null, error: null },
    };
    return Promise.resolve(responses[name]);
  });
  mocks.send.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("reminder worker route", () => {
  it("rejects requests without the high-entropy shared secret", async () => {
    const response = await POST(new Request("https://supplierdesk.example/api/cron/reminders", { method: "POST" }));
    expect(response.status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("does not claim jobs until email and stable-link settings are configured", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("keeps the worker disabled when a production malware scanner is not enabled", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("enqueues, claims, sends and completes a reminder", async () => {
    const response = await POST(request());
    const expectedToken = createHmac("sha256", "l".repeat(32))
      .update(`supplierdesk-reminder:${deliveryId}`)
      .digest("hex");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ claimed: 1, sent: 1, skipped: 0, failed: 0 });
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "enqueue_due_reminders");
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "claim_due_reminders", { batch_size: 10 });
    expect(mocks.rpc).toHaveBeenCalledWith("create_reminder_supplier_upload_link", {
      delivery_id: deliveryId,
      token: expectedToken,
    });
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({
      to: job.recipient_email,
      idempotencyKey: `supplierdesk-reminder-${deliveryId}`,
    }));
    expect(mocks.rpc).toHaveBeenCalledWith("complete_reminder_delivery", {
      delivery_id: deliveryId,
      outcome: "sent",
    });
  });

  it("returns a generic server error when the database worker fails", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "database_error" } });
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const response = await POST(request());
      expect(response.status).toBe(500);
      expect(await response.text()).toBe("Reminder worker failed");
      expect(errorLog).toHaveBeenCalledWith("Reminder worker request failed", { errorName: "Error" });
      expect(mocks.send).not.toHaveBeenCalled();
    } finally {
      errorLog.mockRestore();
    }
  });
});
