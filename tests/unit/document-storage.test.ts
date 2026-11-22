import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  upload: vi.fn<(path: string, data: Uint8Array, options: { contentType: string; upsert: boolean }) =>
    Promise<{ error: { name: string } | null }>>(),
  remove: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceClient: () => ({
    storage: { from: () => ({ upload: mocks.upload, remove: mocks.remove }) },
    rpc: mocks.rpc,
  }),
}));

import { storeDocument } from "../../src/services/document-uploads";

const pdf = new File(["%PDF-1"], "certificate.pdf", { type: "application/pdf" });
const member = { kind: "member", userId: "member-id" } as const;
const supplier = { kind: "supplier", linkHash: "a".repeat(64) } as const;
const input = { companyId: "company-id", itemId: "item-id", file: pdf, expiresOn: "2027-01-01", actor: member };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("DOCUMENT_SCANNER", "local-noop");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "local-test-key");
  mocks.upload.mockResolvedValue({ error: null });
  mocks.remove.mockResolvedValue({ error: null });
  mocks.rpc.mockResolvedValue({ error: null });
});

afterEach(() => vi.unstubAllEnvs());

describe("document storage", () => {
  it.each([
    { ...input, file: null },
    { ...input, file: new File([], "empty.pdf", { type: "application/pdf" }) },
    { ...input, expiresOn: "invalid" },
    { ...input, file: new File(["wrong"], "certificate.pdf", { type: "application/pdf" }) },
  ])("rejects invalid files and expiry without touching storage", async (invalid) => {
    await expect(storeDocument(invalid)).resolves.toEqual({ ok: false, reason: "upload" });
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("fails closed when no scanner is configured", async () => {
    vi.stubEnv("DOCUMENT_SCANNER", "");
    await expect(storeDocument(input)).resolves.toEqual({ ok: false, reason: "scanner" });
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("fails closed when the storage service key is missing", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    await expect(storeDocument(input)).resolves.toEqual({ ok: false, reason: "storage" });
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it.each([
    [member, "record_document_upload", { submitted_by: member.userId }],
    [supplier, "record_supplier_document_upload", { link_hash: supplier.linkHash }],
  ])("records a validated upload for the correct actor", async (actor, operation, actorDetails) => {
    await expect(storeDocument({ ...input, actor })).resolves.toEqual({ ok: true });
    const [path] = mocks.upload.mock.calls[0] ?? [];
    expect(path).toMatch(/^company-id\/item-id\/[0-9a-f-]{36}$/);
    expect(mocks.rpc).toHaveBeenCalledWith(operation, expect.objectContaining({
      target_company: input.companyId, target_item: input.itemId, expiration: input.expiresOn, ...actorDetails,
    }));
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("attempts object cleanup after a failed storage upload", async () => {
    mocks.upload.mockResolvedValue({ error: { name: "StorageError" } });
    await expect(storeDocument(input)).resolves.toEqual({ ok: false, reason: "storage" });
    expect(mocks.remove).toHaveBeenCalledWith([mocks.upload.mock.calls[0]?.[0]]);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("cleans up an object when the database explicitly rejects the version", async () => {
    mocks.rpc.mockResolvedValue({ error: { code: "42501" } });
    await expect(storeDocument(input)).resolves.toEqual({ ok: false, reason: "state" });
    expect(mocks.remove).toHaveBeenCalledWith([mocks.upload.mock.calls[0]?.[0]]);
  });

  it("preserves the object for reconciliation when the database outcome is ambiguous", async () => {
    mocks.rpc.mockResolvedValue({ error: { code: "CONNECTION_ERROR" } });
    await expect(storeDocument(input)).resolves.toEqual({ ok: false, reason: "storage" });
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});
