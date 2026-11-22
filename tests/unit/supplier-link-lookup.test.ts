import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  headers: vi.fn(),
  ipKey: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@/lib/security/supplier-portal-rate-limit", () => ({ supplierPortalIpKey: mocks.ipKey }));
vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceClient: () => ({ rpc: mocks.rpc }),
}));

import { findSupplierLink } from "../../src/lib/supabase/supplier-links";

const token = "a".repeat(64);
const hash = createHash("sha256").update(token).digest("hex");
const ipKey = "b".repeat(64);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.headers.mockResolvedValue(new Headers({ "x-vercel-forwarded-for": "203.0.113.1" }));
  mocks.ipKey.mockReturnValue(ipKey);
});

describe("supplier link lookup", () => {
  it("rate-limits before resolving a token and returns its request scope", async () => {
    const link = { company_id: "company", request_id: "request" };
    mocks.rpc.mockResolvedValueOnce({ data: true, error: null }).mockResolvedValueOnce({ data: [link], error: null });
    await expect(findSupplierLink(token)).resolves.toEqual({ ...link, linkHash: hash });
    expect(mocks.rpc.mock.calls).toEqual([
      ["consume_supplier_portal_limit", { ip_key: ipKey, token_key: hash }],
      ["resolve_supplier_upload_link", { link_hash: hash }],
    ]);
  });

  it("charges malformed tokens against the IP limit without resolving them", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: true, error: null });
    await expect(findSupplierLink("invalid")).resolves.toBeNull();
    expect(mocks.rpc.mock.calls).toEqual([
      ["consume_supplier_portal_limit", { ip_key: ipKey, token_key: null }],
    ]);
  });

  it("does not resolve a token after the limiter denies access", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: false, error: null });
    await expect(findSupplierLink(token)).resolves.toBeNull();
    expect(mocks.rpc).toHaveBeenCalledOnce();
  });

  it("fails closed if the rate-limit service fails", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "DB_ERROR" } });
    await expect(findSupplierLink(token)).rejects.toThrow("Unable to check supplier portal access");
    expect(mocks.rpc).toHaveBeenCalledOnce();
  });

  it("returns no link when a valid-format token is not active", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: true, error: null }).mockResolvedValueOnce({ data: [], error: null });
    await expect(findSupplierLink(token)).resolves.toBeNull();
  });

  it("surfaces database errors while resolving a link", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: null, error: { code: "DB_ERROR" } });
    await expect(findSupplierLink(token)).rejects.toThrow("Unable to check supplier link");
  });
});
