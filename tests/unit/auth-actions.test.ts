import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signUp: vi.fn(),
  signOut: vi.fn(),
  signIn: vi.fn(),
  rpc: vi.fn(),
  redirect: vi.fn((path: string): never => { throw new Error(`REDIRECT ${path}`); }),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/env", () => ({
  getServerEnvironment: () => ({ SITE_URL: "https://supplierdesk.example" }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => ({
    auth: { signUp: mocks.signUp, signOut: mocks.signOut, signInWithPassword: mocks.signIn },
    rpc: mocks.rpc,
  }),
}));

import { register } from "../../src/app/register/actions";
import { signIn } from "../../src/app/sign-in/actions";
import { signOut } from "../../src/app/workspace/sign-out";

function form(values: Record<string, string>) {
  const result = new FormData();
  for (const [key, value] of Object.entries(values)) result.set(key, value);
  return result;
}

const registration = {
  administratorName: "Ada Example", email: " ADA@EXAMPLE.TEST ", password: "a secure password",
  companyName: "Example Manufacturing", country: "AT", businessDetails: "Industrial components",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.signUp.mockResolvedValue({ data: { session: null }, error: null });
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.signIn.mockResolvedValue({ error: null });
  mocks.rpc.mockResolvedValue({ error: null });
});

describe("authentication actions", () => {
  it("requests email verification for a valid owner registration", async () => {
    await expect(register(null, form(registration))).rejects.toThrow("REDIRECT /register/check-email");
    expect(mocks.signUp).toHaveBeenCalledWith(expect.objectContaining({
      email: "ada@example.test",
      options: {
        emailRedirectTo: "https://supplierdesk.example/auth/callback",
        data: {
          enrollment_type: "owner", administrator_name: "Ada Example",
          company_name: "Example Manufacturing", country: "AT", business_details: "Industrial components",
        },
      },
    }));
  });

  it("rejects malformed registration and authentication errors without redirecting", async () => {
    expect(await register(null, form({ ...registration, password: "short" }))).toEqual({ ok: false, reason: "invalid" });
    expect(mocks.signUp).not.toHaveBeenCalled();
    mocks.signUp.mockResolvedValue({ data: { session: null }, error: { code: "auth_error" } });
    expect(await register(null, form(registration))).toEqual({ ok: false, reason: "unavailable" });
  });

  it("signs out an unexpected unverified session", async () => {
    mocks.signUp.mockResolvedValue({ data: { session: { access_token: "test" } }, error: null });
    expect(await register(null, form(registration))).toEqual({ ok: false, reason: "verification_required" });
    expect(mocks.signOut).toHaveBeenCalledOnce();
  });

  it("surfaces sign-out failure after an unexpected session", async () => {
    mocks.signUp.mockResolvedValue({ data: { session: { access_token: "test" } }, error: null });
    mocks.signOut.mockResolvedValue({ error: { code: "failed" } });
    await expect(register(null, form(registration))).rejects.toThrow("Unable to end unverified session");
  });

  it("does not provision a workspace when sign-in fails", async () => {
    mocks.signIn.mockResolvedValue({ error: { code: "invalid_credentials" } });
    expect(await signIn(null, form({ email: "owner@example.test", password: "password" }))).toEqual({ ok: false });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("does not redirect to a workspace when provisioning fails", async () => {
    mocks.rpc.mockResolvedValue({ error: { code: "failed" } });
    expect(await signIn(null, form({ email: "owner@example.test", password: "password" }))).toEqual({ ok: false });
  });

  it("provisions after sign-in and redirects to workspaces", async () => {
    await expect(signIn(null, form({ email: "OWNER@example.test", password: "password" })))
      .rejects.toThrow("REDIRECT /workspace");
    expect(mocks.signIn).toHaveBeenCalledWith({ email: "owner@example.test", password: "password" });
    expect(mocks.rpc).toHaveBeenCalledWith("create_owner_workspace");
  });

  it("redirects only after sign-out succeeds", async () => {
    mocks.signOut.mockResolvedValueOnce({ error: { code: "failed" } });
    await expect(signOut()).rejects.toThrow("Unable to sign out");
    await expect(signOut()).rejects.toThrow("REDIRECT /");
  });
});
