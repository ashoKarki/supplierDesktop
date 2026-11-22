import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

type Result = { data: unknown; error: { code: string } | null };
const mocks = vi.hoisted(() => ({
  roleFor: vi.fn(),
  filter: vi.fn(),
  results: {} as Record<string, Result>,
  notFound: vi.fn((): never => { throw new Error("NOT_FOUND"); }),
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, connection: vi.fn().mockResolvedValue(undefined) };
});
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/lib/supabase/require-user", () => ({ requireUser: () => ({ id: "user-id" }) }));
vi.mock("@/lib/supabase/suppliers", () => ({ supplierRepository: () => ({ roleFor: mocks.roleFor }) }));
vi.mock("@/components/supplier-link-form", () => ({
  SupplierLinkForm: () => "Supplier link controls",
}));
vi.mock("@/app/workspace/[companyId]/requests/actions", () => ({
  addDocumentRequest: vi.fn(), reviewDocument: vi.fn(), revokeSupplierLink: vi.fn(), uploadDocument: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => ({
    from(table: string) {
      const initial = mocks.results[table];
      if (!initial) throw new Error(`Unexpected table: ${table}`);
      let result: Result = initial;
      const chain = {
        select() { return chain; },
        eq(column: string, value: string) { mocks.filter(table, column, value); return chain; },
        order() { return chain; },
        limit() { return chain; },
        gt() { result = { data: [], error: null }; return chain; },
        maybeSingle() { return Promise.resolve(result); },
        then(resolve: (value: Result) => void, reject: (reason: unknown) => void) {
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return chain;
    },
  }),
}));

import RequestsPage from "../../src/app/workspace/[companyId]/requests/page";

const companyId = "d9aa6857-7de8-4771-8c82-aa114a916431";
const requestId = "25fb6029-c79a-4227-bd61-2e5ad1867ead";
const supplierId = "df53d5c6-bcca-4ffb-989c-cb5e5ab7625b";
const requirementId = "5377332e-6a13-415c-8e15-80eae2ba1ddd";
const itemId = "a160250b-f908-40e6-a12e-8f31cb67c484";
const versionId = "510c6c31-d48f-4dcf-9abf-04cc0cf9d560";
const linkId = "48860302-d709-4e8d-a6bf-176067a5b071";

function props(error?: string) {
  return { params: Promise.resolve({ companyId }), searchParams: Promise.resolve({ error }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.roleFor.mockResolvedValue("owner");
  mocks.results = {
    companies: { data: { id: companyId, name: "Manufacturer" }, error: null },
    suppliers: { data: [{ id: supplierId, name: "Supplier A", archived_at: null }], error: null },
    document_requirements: { data: [{ id: requirementId, name: "Certificate" }], error: null },
    document_requests: { data: [{ id: requestId, supplier_id: supplierId, created_at: "2026-01-01" }], error: null },
    document_request_items: {
      data: [{ id: itemId, request_id: requestId, requirement_id: requirementId, status: "submitted", expires_on: null }],
      error: null,
    },
    document_versions: { data: [{ id: versionId, item_id: itemId, version_number: 1, filename: "certificate.pdf" }], error: null },
    document_review_events: {
      data: [{ id: versionId, item_id: itemId, status: "submitted", reason: null, created_at: "2026-01-01" }],
      error: null,
    },
    supplier_upload_links: {
      data: [{ id: linkId, request_id: requestId, expires_at: "2099-01-01T00:00:00Z", revoked_at: null }], error: null,
    },
    notifications: { data: [{ id: linkId, item_id: itemId, created_at: "2026-01-01" }], error: null },
  };
});

describe("manufacturer requests page", () => {
  it("denies users without a workspace role before loading data", async () => {
    mocks.roleFor.mockResolvedValue(null);
    await expect(RequestsPage(props())).rejects.toThrow("NOT_FOUND");
    expect(mocks.filter).not.toHaveBeenCalled();
  });

  it("shows submitted documents, notifications, and review controls to authorized staff", async () => {
    const markup = renderToStaticMarkup(await RequestsPage(props()));
    expect(markup).toContain("Supplier A");
    expect(markup).toContain("Certificate");
    expect(markup).toContain("certificate.pdf");
    expect(markup).toContain("Recent supplier submissions");
    expect(markup).toContain("Start review");
    expect(markup).toContain("Review history");
    expect(markup).toContain("Supplier link controls");
    expect(markup).toContain("Revoke");
    for (const table of [
      "suppliers", "document_requirements", "document_requests", "document_request_items",
      "document_versions", "document_review_events", "supplier_upload_links", "notifications",
    ]) {
      expect(mocks.filter).toHaveBeenCalledWith(table, "company_id", companyId);
    }
  });

  it("shows approve and reject controls only when review is in progress", async () => {
    mocks.results.document_request_items = {
      data: [{ id: itemId, request_id: requestId, requirement_id: requirementId, status: "under_review", expires_on: "2027-01-01" }],
      error: null,
    };
    const markup = renderToStaticMarkup(await RequestsPage(props("review")));
    expect(markup).toContain("Approve");
    expect(markup).toContain("Reject");
    expect(markup).toContain("Review could not be completed");
  });

  it("allows a new upload after rejection", async () => {
    mocks.results.document_request_items = {
      data: [{ id: itemId, request_id: requestId, requirement_id: requirementId, status: "rejected", expires_on: null }],
      error: null,
    };
    const markup = renderToStaticMarkup(await RequestsPage(props()));
    expect(markup).toContain("Upload new version");
    expect(markup).not.toContain("Start review");
  });

  it("hides management controls and does not load bearer-link metadata for a viewer", async () => {
    mocks.roleFor.mockResolvedValue("viewer");
    const markup = renderToStaticMarkup(await RequestsPage(props()));
    expect(markup).toContain("certificate.pdf");
    expect(markup).not.toContain('aria-labelledby="create-request-title"');
    expect(markup).not.toContain("Supplier link controls");
    expect(markup).not.toContain("Start review");
    expect(mocks.filter).not.toHaveBeenCalledWith("supplier_upload_links", "company_id", companyId);
  });

  it("shows an empty state and prerequisites when there are no suppliers or requests", async () => {
    mocks.results.suppliers = { data: [], error: null };
    mocks.results.document_requests = { data: [], error: null };
    mocks.results.notifications = { data: [], error: null };
    const markup = renderToStaticMarkup(await RequestsPage(props()));
    expect(markup).toContain("Add an active supplier and a document requirement");
    expect(markup).toContain("No requests yet");
  });

  it("surfaces errors when a tenant-scoped list cannot be loaded", async () => {
    mocks.results.document_requests = { data: null, error: { code: "failed" } };
    await expect(RequestsPage(props())).rejects.toThrow("Unable to load document requests");
  });
});
