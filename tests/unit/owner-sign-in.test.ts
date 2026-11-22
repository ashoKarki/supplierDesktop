import { describe, expect, it, vi } from "vitest";
import { signInOwner } from "../../src/services/owner-sign-in";

describe("owner sign-in", () => {
  const credentials = { email: " OWNER@EXAMPLE.COM ", password: "a secure password" };

  it("signs in and retries idempotent workspace provisioning", async () => {
    const signIn = vi.fn().mockResolvedValue(true);
    const provision = vi.fn().mockResolvedValue(true);
    expect(await signInOwner(credentials, { signIn, provision })).toEqual({ ok: true });
    expect(signIn).toHaveBeenCalledWith("owner@example.com", credentials.password);
    expect(provision).toHaveBeenCalledOnce();
  });

  it("does not provision after failed authentication", async () => {
    const signIn = vi.fn().mockResolvedValue(false);
    const provision = vi.fn();
    expect(await signInOwner(credentials, { signIn, provision })).toEqual({ ok: false });
    expect(provision).not.toHaveBeenCalled();
  });

  it("does not claim success if provisioning fails", async () => {
    expect(await signInOwner(credentials, {
      signIn: vi.fn().mockResolvedValue(true),
      provision: vi.fn().mockResolvedValue(false),
    })).toEqual({ ok: false });
  });

  it("does not call authentication for invalid input", async () => {
    const signIn = vi.fn();
    expect(await signInOwner({ email: "invalid", password: "password" }, {
      signIn,
      provision: vi.fn(),
    })).toEqual({ ok: false });
    expect(signIn).not.toHaveBeenCalled();
  });
});
