import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
  download: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => ({
    auth: { getUser: mocks.getUser },
    from: mocks.from,
  }),
}));
vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceClient: () => ({
    storage: { from: () => ({ download: mocks.download }) },
  }),
}));

import { GET } from "../../src/app/workspace/[companyId]/documents/[versionId]/route";

const companyId = "d9aa6857-7de8-4771-8c82-aa114a916431";
const versionId = "25fb6029-c79a-4227-bd61-2e5ad1867ead";
const request = new Request("http://localhost/document");
const context = { params: Promise.resolve({ companyId, versionId }) };

beforeEach(() => {
  vi.clearAllMocks();
  const query = { select: mocks.select, eq: mocks.eq, maybeSingle: mocks.maybeSingle };
  mocks.from.mockReturnValue(query);
  mocks.select.mockReturnValue(query);
  mocks.eq.mockReturnValue(query);
  mocks.getUser.mockResolvedValue({ data: { user: { id: "user" } }, error: null });
  mocks.maybeSingle.mockResolvedValue({ data: { storage_path: "private/path", filename: "certificate.pdf" }, error: null });
  mocks.download.mockResolvedValue({ data: new Blob(["document"]), error: null });
});

describe("document download", () => {
  it("rejects invalid identifiers before querying storage", async () => {
    const result = await GET(request, { params: Promise.resolve({ companyId: "invalid", versionId }) });
    expect(result.status).toBe(404);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it("requires authentication before querying documents", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect((await GET(request, context)).status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it("surfaces authentication service failures", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { name: "AuthError", code: "failed" } });
    expect((await GET(request, context)).status).toBe(500);
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it("does not download documents hidden by tenant policies", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect((await GET(request, context)).status).toBe(404);
    expect(mocks.eq.mock.calls).toEqual([["company_id", companyId], ["id", versionId]]);
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it("surfaces document lookup and storage errors", async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: { code: "failed" } });
    expect((await GET(request, context)).status).toBe(500);
    expect(mocks.download).not.toHaveBeenCalled();
    mocks.download.mockResolvedValueOnce({ data: null, error: { name: "StorageError" } });
    expect((await GET(request, context)).status).toBe(500);
  });

  it("streams a private attachment with a safely encoded filename", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: { storage_path: "private/path", filename: "certificate'().pdf" }, error: null,
    });
    const result = await GET(request, context);
    expect(result.status).toBe(200);
    expect(await result.text()).toBe("document");
    expect(mocks.download).toHaveBeenCalledWith("private/path");
    expect(result.headers.get("content-disposition")).toContain("certificate%27%28%29.pdf");
    expect(result.headers.get("cache-control")).toBe("private, no-store");
    expect(result.headers.get("x-content-type-options")).toBe("nosniff");
  });
});
