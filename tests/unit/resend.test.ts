import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { resendEmailProvider } from "../../src/lib/email/resend";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Resend email provider", () => {
  it("uses a stable provider idempotency key when supplied", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const email = resendEmailProvider("test-key", "noreply@example.test");
    await email.send({
      to: "supplier@example.test",
      subject: "Reminder",
      text: "Documents are due.",
      idempotencyKey: "supplierdesk-reminder-123",
    });

    const options = fetchMock.mock.calls[0]?.[1];
    expect(options?.headers).toEqual(expect.objectContaining({
      "Idempotency-Key": "supplierdesk-reminder-123",
    }));
  });
});
