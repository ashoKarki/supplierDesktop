import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

type Result = { data: unknown; error: { code: string } | null };
const mocks = vi.hoisted(() => ({
  findLink: vi.fn(),
  filter: vi.fn(),
  results: {} as Record<string, Result>,
  notFound: vi.fn((): never => { throw new Error("NOT_FOUND"); }),
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, connection: vi.fn().mockResolvedValue(undefined) };
});
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/lib/supabase/supplier-links", () => ({ findSupplierLink: mocks.findLink }));
vi.mock("@/lib/supabase/service", () => ({
  createSupabaseServiceClient: () => ({
    from(table: string) {
      const result = mocks.results[table];
      if (!result) throw new Error(`Unexpected table: ${table}`);
      const chain = {
        select() { return chain; },
        eq(column: string, value: string) { mocks.filter(table, column, value); return chain; },
        order() { return chain; },
        limit() { return chain; },
        in() { return Promise.resolve(result); },
        maybeSingle() { return Promise.resolve(result); },
        then: Promise.resolve(result).then.bind(Promise.resolve(result)),
      };
      return chain;
    },
  }),
}));
vi.mock("@/app/supplier/upload/[token]/actions", () => ({ uploadSupplierDocument: vi.fn() }));

import SupplierUploadPage from "../../src/app/supplier/upload/[token]/page";

const companyId = "d9aa6857-7de8-4771-8c82-aa114a916431";
const requestId = "25fb6029-c79a-4227-bd61-2e5ad1867ead";
const itemId = "a160250b-f908-40e6-a12e-8f31cb67c484";
const requirementId = "5377332e-6a13-415c-8e15-80eae2ba1ddd";
const token = "a".repeat(64);

function props(search: { lang?: string; uploaded?: string; error?: string } = {}) {
  return { params: Promise.resolve({ token }), searchParams: Promise.resolve(search) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findLink.mockResolvedValue({
    company_id: companyId, request_id: requestId, expires_at: "2027-01-01T00:00:00.000Z",
  });
  mocks.results = {
    companies: { data: { name: "Manufacturer", time_zone: "Europe/Vienna" }, error: null },
    document_requests: { data: { supplier_id: "supplier-id", deadline: "2027-01-20" }, error: null },
    document_request_items: { data: [{ id: itemId, status: "requested", requirement_id: requirementId }], error: null },
    suppliers: { data: { name: "Supplier" }, error: null },
    document_requirements: { data: [{ id: requirementId, name: "Certificate" }], error: null },
    document_review_events: { data: { reason: "Outdated" }, error: null },
  };
});

describe("supplier portal page", () => {
  it("does not load request details for an invalid link", async () => {
    mocks.findLink.mockResolvedValue(null);
    await expect(SupplierUploadPage(props())).rejects.toThrow("NOT_FOUND");
    expect(mocks.filter).not.toHaveBeenCalled();
  });

  it("renders a scoped request and upload form in English", async () => {
    const markup = renderToStaticMarkup(await SupplierUploadPage(props({ lang: "en" })));
    expect(markup).toContain("Manufacturer");
    expect(markup).toContain("Supplier");
    expect(markup).toContain("Certificate");
    expect(markup).toContain("Submission deadline: 2027-01-20 (Europe/Vienna)");
    expect(markup).toContain('name="file"');
    expect(mocks.filter).toHaveBeenCalledWith("document_requests", "company_id", companyId);
    expect(mocks.filter).toHaveBeenCalledWith("document_request_items", "request_id", requestId);
    expect(mocks.filter).toHaveBeenCalledWith("suppliers", "company_id", companyId);
    expect(mocks.filter).toHaveBeenCalledWith("document_requirements", "company_id", companyId);
  });

  it("renders rejection reasons and permits resubmission", async () => {
    mocks.results.document_request_items = {
      data: [{ id: itemId, status: "rejected", requirement_id: requirementId }], error: null,
    };
    const markup = renderToStaticMarkup(await SupplierUploadPage(props({ lang: "de", uploaded: "1" })));
    expect(markup).toContain('lang="de"');
    expect(markup).toContain("Outdated");
    expect(markup).toContain("Einreichungsfrist: 2027-01-20 (Europe/Vienna)");
    expect(markup).toContain('name="file"');
    expect(mocks.filter).toHaveBeenCalledWith("document_review_events", "company_id", companyId);
    expect(mocks.filter).toHaveBeenCalledWith("document_review_events", "item_id", itemId);
  });

  it("does not offer an upload form while review is pending", async () => {
    mocks.results.document_request_items = {
      data: [{ id: itemId, status: "under_review", requirement_id: requirementId }], error: null,
    };
    const markup = renderToStaticMarkup(await SupplierUploadPage(props()));
    expect(markup).not.toContain('name="file"');
  });

  it("fails safely when request data is unavailable", async () => {
    mocks.results.document_requests = { data: null, error: null };
    await expect(SupplierUploadPage(props())).rejects.toThrow("NOT_FOUND");
    mocks.results.document_requests = { data: null, error: { code: "failed" } };
    await expect(SupplierUploadPage(props())).rejects.toThrow("Unable to load supplier request");
  });
});
