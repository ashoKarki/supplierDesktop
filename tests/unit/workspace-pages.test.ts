import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

type Result = { data: unknown; error: { code: string } | null };
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  roleFor: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  getUser: vi.fn(),
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
vi.mock("@/app/workspace/[companyId]/actions", () => ({ updateSupplier: vi.fn() }));
vi.mock("@/app/workspace/[companyId]/requirements/actions", () => ({ addRequirement: vi.fn() }));
vi.mock("@/app/workspace/[companyId]/settings/actions", () => ({ saveCompanyProfile: vi.fn() }));
vi.mock("@/app/workspace/sign-out", () => ({ signOut: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => ({
    auth: { getUser: mocks.getUser },
    rpc(name: string, args: Record<string, unknown>) {
      mocks.rpc(name, args);
      if (name === "workspace_report_page") {
        const kind = args.requested_kind;
        const result = typeof kind === "string" ? mocks.results[`report_${kind}`] : undefined;
        return Promise.resolve(result ?? { data: { total: 0, rows: [] }, error: null });
      }
      const tables = ["suppliers", "document_requirements", "document_requests", "document_request_items"];
      const failed = tables.map((table) => mocks.results[table]).find((result) => result?.error);
      if (failed) return Promise.resolve(failed);
      return Promise.resolve({ data: {
        suppliers: mocks.results.suppliers?.data,
        requirements: mocks.results.document_requirements?.data,
        requests: mocks.results.document_requests?.data,
        items: mocks.results.document_request_items?.data,
      }, error: null });
    },
    from(table: string) {
      mocks.from(table);
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
        single() { return Promise.resolve(result); },
        then(resolve: (value: Result) => void, reject: (reason: unknown) => void) {
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return chain;
    },
  }),
}));

import CompanyWorkspace from "../../src/app/workspace/[companyId]/page";
import Dashboard from "../../src/app/workspace/[companyId]/dashboard/page";
import ReportsPage from "../../src/app/workspace/[companyId]/reports/page";
import { GET as exportReport } from "../../src/app/workspace/[companyId]/reports/[kind]/route";
import RequirementsPage from "../../src/app/workspace/[companyId]/requirements/page";
import CompanySettings from "../../src/app/workspace/[companyId]/settings/page";
import WorkspaceList from "../../src/app/workspace/page";

const companyId = "d9aa6857-7de8-4771-8c82-aa114a916431";
const firstId = "25fb6029-c79a-4227-bd61-2e5ad1867ead";
const secondId = "5377332e-6a13-415c-8e15-80eae2ba1ddd";

function props(search: Record<string, string | string[] | undefined> = {}) {
  return { params: Promise.resolve({ companyId }), searchParams: Promise.resolve(search) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.roleFor.mockResolvedValue("owner");
  mocks.getUser.mockResolvedValue({ data: { user: { id: "user-id" } }, error: null });
  mocks.results = {
    companies: { data: { id: companyId, name: "Manufacturer", country: "DE", business_details: "Manufacturing", time_zone: "Europe/Vienna" }, error: null },
    suppliers: {
      data: [
        { id: firstId, name: "Active supplier", contact_email: "contact@example.com", archived_at: null },
        { id: secondId, name: "Archived supplier", contact_email: null, archived_at: "2026-01-01" },
      ],
      error: null,
    },
    document_requirements: {
      data: [{ id: firstId, name: "Certificate", renewal_months: 12 }],
      error: null,
    },
    document_requests: { data: [], error: null },
    document_request_items: { data: [], error: null },
    company_trials: { data: { ends_at: "2027-01-01T00:00:00Z" }, error: null },
    report_compliance: {
      data: { total: 1, rows: [{ supplier: "Active supplier", required: 0, approved: 0, missing: 0, expired: 0, status: "Not assessed" }] },
      error: null,
    },
    report_expiry: { data: { total: 0, rows: [] }, error: null },
    report_outstanding: { data: { total: 0, rows: [] }, error: null },
  };
});

describe("workspace pages", () => {
  it("renders reports for members and restricts export controls to authorized roles", async () => {
    const ownerMarkup = renderToStaticMarkup(await ReportsPage(props()));
    expect(ownerMarkup).toContain("Supplier compliance");
    expect(ownerMarkup).toContain("Not assessed");
    expect(ownerMarkup).toContain("Download CSV");
    expect(ownerMarkup).toContain("Download PDF");
    mocks.roleFor.mockResolvedValue("viewer");
    const viewerMarkup = renderToStaticMarkup(await ReportsPage(props()));
    expect(viewerMarkup).toContain("Supplier compliance");
    expect(viewerMarkup).not.toContain("Download CSV");
    expect(viewerMarkup).not.toContain("Download PDF");
  });

  it("uses independent server-side report pages", async () => {
    mocks.results.report_compliance = {
      data: { total: 120, rows: [{ supplier: "Active supplier", required: 0, approved: 0, missing: 0, expired: 0, status: "Not assessed" }] },
      error: null,
    };
    const markup = renderToStaticMarkup(await ReportsPage(props({ compliance: "2" })));
    expect(markup).toContain("Showing 51-100 of 120");
    expect(mocks.rpc).toHaveBeenCalledWith("workspace_report_page", {
      target_company: companyId,
      requested_kind: "compliance",
      page_size: 50,
      page_offset: 50,
    });
  });

  it("exports PDFs only to authorized members and reports unsupported characters", async () => {
    const params = Promise.resolve({ companyId, kind: "compliance" });
    const request = new Request("http://localhost?format=pdf");
    const response = await exportReport(request, { params });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(Buffer.from(await response.arrayBuffer()).subarray(0, 5).toString()).toBe("%PDF-");
    mocks.results.report_compliance = {
      data: { total: 1, rows: [{ supplier: "Supplier 😀", required: 0, approved: 0, missing: 0, expired: 0, status: "Not assessed" }] },
      error: null,
    };
    expect((await exportReport(request, { params })).status).toBe(422);
    mocks.roleFor.mockResolvedValue("viewer");
    expect((await exportReport(request, { params })).status).toBe(404);
  });

  it("enforces role and company scope for CSV exports", async () => {
    const request = new Request("http://localhost");
    const params = Promise.resolve({ companyId, kind: "compliance" });
    mocks.results.report_compliance = {
      data: { total: 1, rows: [{ supplier: "=malicious", required: 0, approved: 0, missing: 0, expired: 0, status: "Not assessed" }] },
      error: null,
    };
    const response = await exportReport(request, { params });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.text()).toContain("\"'=malicious\"");
    expect(mocks.rpc).toHaveBeenCalledWith("workspace_report_page", {
      target_company: companyId,
      requested_kind: "compliance",
      page_size: 10_000,
      page_offset: 0,
    });
    mocks.from.mockClear();
    mocks.roleFor.mockResolvedValue("viewer");
    expect((await exportReport(request, { params })).status).toBe(404);
    expect(mocks.from).not.toHaveBeenCalled();
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect((await exportReport(request, { params })).status).toBe(401);
    expect((await exportReport(request, { params: Promise.resolve({ companyId, kind: "other" }) })).status).toBe(404);
  });

  it("rejects oversized report exports instead of returning a truncated file", async () => {
    mocks.results.report_compliance = { data: { total: 10_001, rows: [] }, error: null };
    const response = await exportReport(new Request("http://localhost"), {
      params: Promise.resolve({ companyId, kind: "compliance" }),
    });
    expect(response.status).toBe(413);
    expect(await response.text()).toContain("10,000-row export limit");
    const pdfResponse = await exportReport(new Request("http://localhost?format=pdf"), {
      params: Promise.resolve({ companyId, kind: "compliance" }),
    });
    expect(pdfResponse.status).toBe(413);
    expect(await pdfResponse.text()).toContain("2,000-row export limit");
  });

  it("authorizes and scopes dashboard queries, and shows its empty state", async () => {
    const markup = renderToStaticMarkup(await Dashboard(props()));
    expect(markup).toContain("No approved documents are expiring");
    expect(markup).toContain("Europe/Vienna");
    expect(markup).toContain("Request documents");
    expect(mocks.rpc).toHaveBeenCalledWith("workspace_document_snapshot", { target_company: companyId });
    mocks.from.mockClear();
    mocks.roleFor.mockResolvedValue(null);
    await expect(Dashboard(props())).rejects.toThrow("NOT_FOUND");
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("renders expiry alerts for viewers without request-management controls", async () => {
    mocks.roleFor.mockResolvedValue("viewer");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
    try {
      mocks.results.document_requests = { data: [{ id: secondId, supplier_id: firstId, created_at: "2025-12-01T00:00:00Z", deadline: null }], error: null };
      mocks.results.document_request_items = { data: [{ id: firstId, request_id: secondId, requirement_id: firstId, status: "approved", expires_on: "2026-02-01" }], error: null };
      const markup = renderToStaticMarkup(await Dashboard(props()));
      expect(markup).toContain("Certificate");
      expect(markup).toContain("Active supplier");
      expect(markup).toContain(`requests#request-${secondId}`);
      expect(markup).not.toContain(">Request documents</a>");
    } finally {
      vi.useRealTimers();
    }
  });

  it("surfaces dashboard query failures", async () => {
    mocks.results.document_requests = { data: null, error: { code: "failed" } };
    await expect(Dashboard(props())).rejects.toThrow("Unable to load dashboard");
  });

  it("shows active suppliers and management controls to an owner", async () => {
    const markup = renderToStaticMarkup(await CompanyWorkspace(props()));
    expect(markup).toContain("Active supplier");
    expect(markup).not.toContain("Archived supplier</strong>");
    expect(markup).toContain("Add a supplier");
    expect(markup).toContain("contact@example.com");
    expect(markup).toContain("Save contact");
    expect(mocks.filter).toHaveBeenCalledWith("suppliers", "company_id", companyId);
  });

  it("filters archived suppliers and hides management controls from viewers", async () => {
    mocks.roleFor.mockResolvedValue("viewer");
    const markup = renderToStaticMarkup(await CompanyWorkspace(props({ status: "archived", q: "Archived" })));
    expect(markup).toContain("Archived supplier");
    expect(markup).not.toContain("Active supplier</strong>");
    expect(markup).not.toContain("Add a supplier");
    expect(markup).not.toContain("Rename Archived supplier");
    expect(markup).not.toContain("Save contact");
  });

  it("shows supplier-limit errors and an empty search result", async () => {
    const markup = renderToStaticMarkup(await CompanyWorkspace(props({ q: "missing", error: "limit_reached" })));
    expect(markup).toContain("100-supplier limit");
    expect(markup).toContain("No suppliers found");
  });

  it("shows requirements and creation controls only to permitted roles", async () => {
    const ownerMarkup = renderToStaticMarkup(await RequirementsPage(props()));
    expect(ownerMarkup).toContain("Certificate");
    expect(ownerMarkup).toContain("Renews every 12 months");
    expect(ownerMarkup).toContain("Add a requirement");
    expect(mocks.filter).toHaveBeenCalledWith("document_requirements", "company_id", companyId);
    mocks.roleFor.mockResolvedValue("viewer");
    const viewerMarkup = renderToStaticMarkup(await RequirementsPage(props()));
    expect(viewerMarkup).not.toContain("Add a requirement");
  });

  it("shows an empty requirement list", async () => {
    mocks.results.document_requirements = { data: [], error: null };
    const markup = renderToStaticMarkup(await RequirementsPage(props()));
    expect(markup).toContain("No requirements yet");
  });

  it("shows editable profile and trial details only to administrators", async () => {
    const ownerMarkup = renderToStaticMarkup(await CompanySettings(props({ saved: "1" })));
    expect(ownerMarkup).toContain("Company profile saved");
    expect(ownerMarkup).toContain("Save changes");
    expect(ownerMarkup).toContain("Company trial");
    expect(mocks.filter).toHaveBeenCalledWith("company_trials", "company_id", companyId);
    mocks.from.mockClear();
    mocks.roleFor.mockResolvedValue("viewer");
    const viewerMarkup = renderToStaticMarkup(await CompanySettings(props()));
    expect(viewerMarkup).not.toContain("Save changes");
    expect(viewerMarkup).toContain('disabled=""');
    expect(mocks.from).not.toHaveBeenCalledWith("company_trials");
  });

  it("denies inaccessible companies before retrieving profile data", async () => {
    mocks.roleFor.mockResolvedValue(null);
    await expect(CompanySettings(props())).rejects.toThrow("NOT_FOUND");
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("lists available workspaces and handles an empty list", async () => {
    mocks.results.companies = { data: [{ id: companyId, name: "Manufacturer" }], error: null };
    expect(renderToStaticMarkup(await WorkspaceList())).toContain(`/workspace/${companyId}`);
    mocks.results.companies = { data: [], error: null };
    expect(renderToStaticMarkup(await WorkspaceList())).toContain("No workspaces yet");
  });

  it("surfaces workspace lookup errors", async () => {
    mocks.results.companies = { data: null, error: { code: "failed" } };
    await expect(WorkspaceList()).rejects.toThrow("Unable to load workspaces");
  });
});
