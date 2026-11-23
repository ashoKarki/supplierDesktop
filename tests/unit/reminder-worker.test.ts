import { describe, expect, it, vi } from "vitest";
import type { EmailMessage } from "../../src/lib/email/provider";
import { processDueReminders } from "../../src/services/reminder-worker";

const supplierJob = {
  id: "431d80bd-f9c6-40c3-8da5-8e24cd473f06",
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

function dependencies(job = supplierJob) {
  return {
    enqueue: vi.fn().mockResolvedValue(1),
    claim: vi.fn().mockResolvedValue([job]),
    supplierToken: vi.fn().mockReturnValue("a".repeat(64)),
    createSupplierLink: vi.fn().mockResolvedValue("a".repeat(64)),
    complete: vi.fn().mockResolvedValue(undefined),
    email: { send: vi.fn<(message: EmailMessage) => Promise<void>>().mockResolvedValue(undefined) },
  };
}

describe("reminder worker", () => {
  it("sends a stable, scoped supplier upload link with a provider idempotency key", async () => {
    const deps = dependencies();
    const result = await processDueReminders("https://supplierdesk.example/", deps);

    expect(result).toEqual({ claimed: 1, sent: 1, skipped: 0, failed: 0 });
    expect(deps.enqueue).toHaveBeenCalledOnce();
    expect(deps.claim).toHaveBeenCalledWith(10);
    expect(deps.createSupplierLink).toHaveBeenCalledWith(supplierJob.id, "a".repeat(64));
    const sent = deps.email.send.mock.calls[0]?.[0];
    expect(sent?.to).toBe(supplierJob.recipient_email);
    expect(sent?.idempotencyKey).toBe(`supplierdesk-reminder-${supplierJob.id}`);
    expect(sent?.text).toContain(`https://supplierdesk.example/supplier/upload/${"a".repeat(64)}?lang=en`);
    expect(deps.complete).toHaveBeenCalledWith(supplierJob.id, "sent");
  });

  it("does not deliver a stale supplier reminder when no active upload link can be issued", async () => {
    const deps = dependencies();
    deps.createSupplierLink.mockResolvedValue(null);

    await expect(processDueReminders("https://supplierdesk.example", deps))
      .resolves.toEqual({ claimed: 1, sent: 0, skipped: 1, failed: 0 });
    expect(deps.email.send).not.toHaveBeenCalled();
    expect(deps.complete).toHaveBeenCalledWith(supplierJob.id, "skipped");
  });

  it("records delivery failures for retry without exposing provider errors", async () => {
    const deps = dependencies();
    deps.email.send.mockRejectedValue(new Error("provider error containing private details"));
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await expect(processDueReminders("https://supplierdesk.example", deps))
        .resolves.toEqual({ claimed: 1, sent: 0, skipped: 0, failed: 1 });
      expect(deps.complete).toHaveBeenCalledWith(supplierJob.id, "failed", "delivery_failed");
      expect(errorLog).toHaveBeenCalledWith("Reminder delivery failed", {
        deliveryId: supplierJob.id,
        errorName: "Error",
      });
    } finally {
      errorLog.mockRestore();
    }
  });
});
