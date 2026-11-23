import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  roleFor: vi.fn(),
  rpc: vi.fn(),
  adminRpc: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
  store: vi.fn(),
  send: vi.fn<(message: { to: string; subject: string; text: string }) => Promise<void>>(),
  revalidate: vi.fn(),
  redirect: vi.fn((path: string): never => { throw new Error(`REDIRECT ${path}`); }),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/env", () => ({ getServerEnvironment: () => ({ SITE_URL: "https://supplierdesk.example" }) }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => ({
    rpc: mocks.rpc,
    from: () => ({ select: mocks.select, eq: mocks.eq, maybeSingle: mocks.maybeSingle }),
  }),
}));
vi.mock("@/lib/supabase/service", () => ({ createSupabaseServiceClient: () => ({ rpc: mocks.adminRpc }) }));
vi.mock("@/lib/supabase/require-user", () => ({ requireUser: () => ({ id: "user-id" }) }));
vi.mock("@/lib/supabase/suppliers", () => ({ supplierRepository: () => ({ roleFor: mocks.roleFor }) }));
vi.mock("@/lib/email/resend", () => ({ resendEmailProvider: () => ({ send: mocks.send }) }));
vi.mock("@/services/document-uploads", () => ({ storeDocument: mocks.store }));

import {
  addDocumentRequest,
  createSupplierLink,
  emailSupplierLink,
  reviewDocument,
  revokeSupplierLink,
  uploadDocument,
} from "../../src/app/workspace/[companyId]/requests/actions";

const companyId = "d9aa6857-7de8-4771-8c82-aa114a916431";
const requestId = "25fb6029-c79a-4227-bd61-2e5ad1867ead";
const itemId = "a160250b-f908-40e6-a12e-8f31cb67c484";
const versionId = "5377332e-6a13-415c-8e15-80eae2ba1ddd";
const token = "a".repeat(64);
const path = `/workspace/${companyId}/requests`;

function form(values: Record<string, string>) {
  const result = new FormData();
  for (const [key, value] of Object.entries(values)) result.set(key, value);
  return result;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("DOCUMENT_SCANNER", "local-noop");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "local-test-key");
  vi.stubEnv("RESEND_API_KEY", "test-key");
  vi.stubEnv("RESEND_FROM_EMAIL", "sender@example.test");
  mocks.roleFor.mockResolvedValue("owner");
  mocks.rpc.mockResolvedValue({ data: token, error: null });
  mocks.adminRpc.mockResolvedValue({ error: null });
  mocks.send.mockResolvedValue(undefined);
  mocks.store.mockResolvedValue({ ok: true });
  const query = { select: mocks.select, eq: mocks.eq, maybeSingle: mocks.maybeSingle };
  mocks.select.mockReturnValue(query);
  mocks.eq.mockReturnValue(query);
  mocks.maybeSingle.mockResolvedValue({ data: { id: itemId, status: "requested" }, error: null });
});

afterEach(() => vi.unstubAllEnvs());

describe("manufacturer request actions", () => {
  it("denies request creation to a viewer", async () => {
    mocks.roleFor.mockResolvedValue("viewer");
    const request = form({ companyId, supplierId: requestId, requirementIds: itemId, deadline: "2027-01-20" });
    await expect(addDocumentRequest(request)).rejects.toThrow(`REDIRECT ${path}?error=1`);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("creates a request only for an authorized company", async () => {
    const request = form({ companyId, supplierId: requestId, requirementIds: itemId, deadline: "2027-01-20" });
    await expect(addDocumentRequest(request)).rejects.toThrow(`REDIRECT ${path}`);
    expect(mocks.rpc).toHaveBeenCalledWith("create_document_request", {
      target_company: companyId, target_supplier: requestId, requirement_ids: [itemId], submission_deadline: "2027-01-20",
    });
    expect(mocks.revalidate).toHaveBeenCalledWith(path);
  });

  it("denies document upload to a viewer before looking up the item", async () => {
    mocks.roleFor.mockResolvedValue("viewer");
    await expect(uploadDocument(form({ companyId, itemId }))).rejects.toThrow(`REDIRECT ${path}?error=permission`);
    expect(mocks.maybeSingle).not.toHaveBeenCalled();
    expect(mocks.store).not.toHaveBeenCalled();
  });

  it("rejects uploads for items not accepting a version", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { id: itemId, status: "submitted" }, error: null });
    await expect(uploadDocument(form({ companyId, itemId }))).rejects.toThrow(`REDIRECT ${path}?error=state`);
    expect(mocks.store).not.toHaveBeenCalled();
  });

  it("passes authenticated member identity to storage", async () => {
    await expect(uploadDocument(form({ companyId, itemId }))).rejects.toThrow(`REDIRECT ${path}`);
    expect(mocks.store).toHaveBeenCalledWith(expect.objectContaining({
      companyId, itemId, actor: { kind: "member", userId: "user-id" },
    }));
    expect(mocks.revalidate).toHaveBeenCalledWith(path);
  });

  it("denies reviews to procurement managers", async () => {
    mocks.roleFor.mockResolvedValue("procurement_manager");
    const review = form({ companyId, itemId, versionId, nextStatus: "approved", reason: "", expiresOn: "" });
    await expect(reviewDocument(review)).rejects.toThrow(`REDIRECT ${path}?error=permission`);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("submits a review within the selected company", async () => {
    const review = form({ companyId, itemId, versionId, nextStatus: "rejected", reason: "outdated", expiresOn: "" });
    await expect(reviewDocument(review)).rejects.toThrow(`REDIRECT ${path}`);
    expect(mocks.rpc).toHaveBeenCalledWith("review_document", expect.objectContaining({
      target_company: companyId, target_item: itemId, target_version: versionId, decision_reason: "outdated",
    }));
  });

  it("reports known database review rejections", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "40001" } });
    const review = form({ companyId, itemId, versionId, nextStatus: "approved", reason: "", expiresOn: "" });
    await expect(reviewDocument(review)).rejects.toThrow(`REDIRECT ${path}?error=review`);
  });

  it("does not issue a supplier link to an unauthorized user", async () => {
    mocks.roleFor.mockResolvedValue("viewer");
    const result = await createSupplierLink({}, form({ companyId, requestId }));
    expect(result.error).toContain("permission");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("does not issue a supplier link without an allowed scanner", async () => {
    vi.stubEnv("DOCUMENT_SCANNER", "");
    const result = await createSupplierLink({}, form({ companyId, requestId }));
    expect(result.error).toContain("not configured");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("issues a request-scoped supplier link for authorized users", async () => {
    const result = await createSupplierLink({}, form({ companyId, requestId }));
    expect(result.url).toBe(`https://supplierdesk.example/supplier/upload/${token}`);
    expect(mocks.rpc).toHaveBeenCalledWith("create_supplier_upload_link", {
      target_company: companyId, target_request: requestId,
    });
  });

  it("does not email a link to an unauthorized user", async () => {
    mocks.roleFor.mockResolvedValue("viewer");
    const result = await emailSupplierLink({}, form({ companyId, requestId, email: "supplier@example.test", language: "en" }));
    expect(result.error).toBeDefined();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("emails a request-scoped link to the specified supplier", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { name: "Manufacturer" }, error: null });
    const result = await emailSupplierLink({}, form({ companyId, requestId, email: "supplier@example.test", language: "en" }));
    expect(result).toEqual({ sent: true });
    expect(mocks.send).toHaveBeenCalledOnce();
    expect(mocks.send.mock.calls[0]?.[0].to).toBe("supplier@example.test");
    expect(mocks.send.mock.calls[0]?.[0].text).toContain(`/supplier/upload/${token}`);
    expect(mocks.rpc).toHaveBeenCalledWith("create_supplier_upload_link", {
      target_company: companyId, target_request: requestId,
    });
  });

  it("compensates an email delivery failure with service-only token revocation", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: { name: "Manufacturer" }, error: null });
    mocks.send.mockRejectedValue(new Error("delivery failed"));
    const result = await emailSupplierLink({}, form({ companyId, requestId, email: "supplier@example.test", language: "en" }));
    expect(result.error).toContain("revoked");
    expect(mocks.adminRpc).toHaveBeenCalledWith("revoke_supplier_link_hash", expect.objectContaining({
      target_company: companyId,
    }));
  });

  it("denies supplier-link revocation to a viewer", async () => {
    mocks.roleFor.mockResolvedValue("viewer");
    await expect(revokeSupplierLink(form({ companyId, linkId: requestId })))
      .rejects.toThrow(`REDIRECT ${path}?error=permission`);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("revokes a supplier link within the selected company", async () => {
    await expect(revokeSupplierLink(form({ companyId, linkId: requestId }))).rejects.toThrow(`REDIRECT ${path}`);
    expect(mocks.rpc).toHaveBeenCalledWith("revoke_supplier_upload_link", {
      target_company: companyId, target_link: requestId,
    });
  });
});
