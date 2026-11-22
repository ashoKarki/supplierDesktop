import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { resendEmailProvider } from "../../src/lib/email/resend";

afterEach(() => vi.unstubAllGlobals());

describe("Resend email provider", () => {
  it("sends a plain-text email to the configured endpoint", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    await resendEmailProvider("test-key", "sender@example.test").send({
      to: "supplier@example.test", subject: "Invitation", text: "Test link",
    });
    expect(fetch).toHaveBeenCalledOnce();
    const [url, options] = fetch.mock.calls[0] ?? [];
    expect(url).toBe("https://api.resend.com/emails");
    expect(options?.body).toBe(JSON.stringify({
      from: "sender@example.test", to: ["supplier@example.test"], subject: "Invitation", text: "Test link",
    }));
  });

  it("surfaces provider rejection instead of reporting success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 429 })));
    await expect(resendEmailProvider("test-key", "sender@example.test").send({
      to: "supplier@example.test", subject: "Invitation", text: "Test link",
    })).rejects.toThrow("Email provider rejected the request");
  });
});
