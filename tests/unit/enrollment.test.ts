import { describe, expect, it, vi } from "vitest";
import { enrollCompany } from "../../src/services/enrollment";

const registration = {
  administratorName: "Ada Example",
  email: " ADA@EXAMPLE.COM ",
  password: "a secure password",
  companyName: "Example Manufacturing",
  country: "AT",
  businessDetails: "Industrial components manufacturer",
};

describe("enrollCompany", () => {
  it("requests email verification with normalized owner and company details", async () => {
    const signUp = vi.fn().mockResolvedValue({ error: null, hasSession: false });
    const result = await enrollCompany(registration, "https://example.test", { signUp, signOut: vi.fn() });

    expect(result).toEqual({ ok: true });
    expect(signUp).toHaveBeenCalledWith({
      email: "ada@example.com",
      password: registration.password,
      emailRedirectTo: "https://example.test/auth/callback",
      metadata: {
        enrollment_type: "owner",
        administrator_name: registration.administratorName,
        company_name: registration.companyName,
        country: registration.country,
        business_details: registration.businessDetails,
      },
    });
  });

  it("does not contact auth for invalid registration data", async () => {
    const signUp = vi.fn();
    const result = await enrollCompany({ ...registration, password: "short" }, "https://example.test", { signUp, signOut: vi.fn() });
    expect(result).toEqual({ ok: false, reason: "invalid" });
    expect(signUp).not.toHaveBeenCalled();
  });

  it("reports auth errors without exposing them", async () => {
    const signUp = vi.fn().mockResolvedValue({ error: "internal detail", hasSession: false });
    expect(await enrollCompany(registration, "https://example.test", { signUp, signOut: vi.fn() })).toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  it("does not report success when email confirmation is disabled", async () => {
    const signUp = vi.fn().mockResolvedValue({ error: null, hasSession: true });
    const signOut = vi.fn().mockResolvedValue(undefined);
    expect(await enrollCompany(registration, "https://example.test", { signUp, signOut })).toEqual({
      ok: false,
      reason: "verification_required",
    });
    expect(signOut).toHaveBeenCalledOnce();
  });
});
