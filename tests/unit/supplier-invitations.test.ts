import { describe, expect, it, vi } from "vitest";
import type { EmailMessage } from "../../src/lib/email/provider";
import { sendSupplierInvitation } from "../../src/services/supplier-invitations";

const companyId = "d9aa6857-7de8-4771-8c82-aa114a916431";
const requestId = "25fb6029-c79a-4227-bd61-2e5ad1867ead";
const input = { companyId, requestId, email: "Supplier@example.test", language: "de" };
const token = "a".repeat(64);

function dependencies() {
  return {
    authorized: vi.fn().mockResolvedValue("Example manufacturer"),
    issue: vi.fn().mockResolvedValue(token),
    revoke: vi.fn().mockResolvedValue(undefined),
    email: { send: vi.fn<(message: EmailMessage) => Promise<void>>().mockResolvedValue(undefined) },
  };
}

describe("supplier invitations", () => {
  it("sends a scoped German invitation to the normalized recipient", async () => {
    const deps = dependencies();
    expect(await sendSupplierInvitation(input, "https://supplierdesk.example", deps)).toEqual({ ok: true });
    expect(deps.issue).toHaveBeenCalledWith(companyId, requestId);
    expect(deps.email.send).toHaveBeenCalledOnce();
    const sent = deps.email.send.mock.calls[0]?.[0];
    expect(sent).toBeDefined();
    expect(sent?.to).toBe("supplier@example.test");
    expect(sent?.text).toContain(`https://supplierdesk.example/supplier/upload/${token}?lang=de`);
    expect(sent?.subject).toContain("Dokument");
  });

  it("uses the English portal and message for an English invitation", async () => {
    const deps = dependencies();
    expect(await sendSupplierInvitation({ ...input, language: "en" }, "https://supplierdesk.example", deps))
      .toEqual({ ok: true });
    const sent = deps.email.send.mock.calls[0]?.[0];
    expect(sent?.text).toContain(`https://supplierdesk.example/supplier/upload/${token}?lang=en`);
    expect(sent?.subject).toContain("documents requested");
  });

  it("rejects malformed input before checking permissions or issuing a token", async () => {
    const deps = dependencies();
    expect(await sendSupplierInvitation({ ...input, email: "bad" }, "https://supplierdesk.example", deps))
      .toEqual({ ok: false, reason: "invalid" });
    expect(deps.authorized).not.toHaveBeenCalled();
    expect(deps.issue).not.toHaveBeenCalled();
  });

  it("does not issue tokens to unauthorized users", async () => {
    const deps = dependencies();
    deps.authorized.mockResolvedValue(null);
    expect(await sendSupplierInvitation(input, "https://supplierdesk.example", deps))
      .toEqual({ ok: false, reason: "forbidden" });
    expect(deps.issue).not.toHaveBeenCalled();
  });

  it("revokes the new token when email delivery fails", async () => {
    const deps = dependencies();
    deps.email.send.mockRejectedValue(new Error("delivery failed"));
    expect(await sendSupplierInvitation(input, "https://supplierdesk.example", deps))
      .toEqual({ ok: false, reason: "delivery" });
    expect(deps.revoke).toHaveBeenCalledWith(companyId, token);
  });

  it("surfaces revocation failures rather than reporting a safe failure", async () => {
    const deps = dependencies();
    deps.email.send.mockRejectedValue(new Error("delivery failed"));
    deps.revoke.mockRejectedValue(new Error("revocation failed"));
    await expect(sendSupplierInvitation(input, "https://supplierdesk.example", deps)).rejects.toThrow("revocation failed");
  });
});
