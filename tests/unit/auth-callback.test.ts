import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  exchange: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, connection: vi.fn().mockResolvedValue(undefined) };
});
vi.mock("@/lib/env", () => ({
  getServerEnvironment: () => ({ SITE_URL: "https://supplierdesk.example" }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => ({
    auth: { exchangeCodeForSession: mocks.exchange },
    rpc: mocks.rpc,
  }),
}));

import { GET } from "../../src/app/auth/callback/route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.exchange.mockResolvedValue({ error: null });
  mocks.rpc.mockResolvedValue({ error: null });
});

describe("email verification callback", () => {
  it("rejects a missing verification code without provisioning", async () => {
    const response = await GET(new NextRequest("https://supplierdesk.example/auth/callback"));
    expect(response.headers.get("location")).toBe("https://supplierdesk.example/register/verification-error");
    expect(mocks.exchange).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("does not provision a workspace if code exchange fails", async () => {
    mocks.exchange.mockResolvedValue({ error: { code: "invalid_code" } });
    const response = await GET(new NextRequest("https://supplierdesk.example/auth/callback?code=bad"));
    expect(response.headers.get("location")).toBe("https://supplierdesk.example/register/verification-error");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("surfaces provisioning failure instead of redirecting to a workspace", async () => {
    mocks.rpc.mockResolvedValue({ error: { code: "failed" } });
    const response = await GET(new NextRequest("https://supplierdesk.example/auth/callback?code=valid"));
    expect(response.headers.get("location")).toBe("https://supplierdesk.example/register/verification-error");
  });

  it("provisions after a successful exchange and redirects to the workspace", async () => {
    const response = await GET(new NextRequest("https://supplierdesk.example/auth/callback?code=valid"));
    expect(mocks.exchange).toHaveBeenCalledWith("valid");
    expect(mocks.rpc).toHaveBeenCalledWith("create_owner_workspace");
    expect(response.headers.get("location")).toBe("https://supplierdesk.example/workspace");
  });
});
