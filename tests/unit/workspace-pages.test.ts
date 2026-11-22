import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

type Result = { data: unknown; error: { code: string } | null };
const mocks = vi.hoisted(() => ({
  roleFor: vi.fn(),
  from: vi.fn(),
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
import RequirementsPage from "../../src/app/workspace/[companyId]/requirements/page";
import CompanySettings from "../../src/app/workspace/[companyId]/settings/page";
import WorkspaceList from "../../src/app/workspace/page";

const companyId = "d9aa6857-7de8-4771-8c82-aa114a916431";
const firstId = "25fb6029-c79a-4227-bd61-2e5ad1867ead";
const secondId = "5377332e-6a13-415c-8e15-80eae2ba1ddd";

function props(search: { q?: string; status?: string; error?: string; saved?: string } = {}) {
  return { params: Promise.resolve({ companyId }), searchParams: Promise.resolve(search) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.roleFor.mockResolvedValue("owner");
  mocks.results = {
    companies: { data: { id: companyId, name: "Manufacturer", country: "DE", business_details: "Manufacturing" }, error: null },
    suppliers: {
      data: [
        { id: firstId, name: "Active supplier", archived_at: null },
        { id: secondId, name: "Archived supplier", archived_at: "2026-01-01" },
      ],
      error: null,
    },
    document_requirements: {
      data: [{ id: firstId, name: "Certificate", renewal_months: 12 }],
      error: null,
    },
    company_trials: { data: { ends_at: "2027-01-01T00:00:00Z" }, error: null },
  };
});

describe("workspace pages", () => {
  it("shows active suppliers and management controls to an owner", async () => {
    const markup = renderToStaticMarkup(await CompanyWorkspace(props()));
    expect(markup).toContain("Active supplier");
    expect(markup).not.toContain("Archived supplier</strong>");
    expect(markup).toContain("Add a supplier");
    expect(mocks.filter).toHaveBeenCalledWith("suppliers", "company_id", companyId);
  });

  it("filters archived suppliers and hides management controls from viewers", async () => {
    mocks.roleFor.mockResolvedValue("viewer");
    const markup = renderToStaticMarkup(await CompanyWorkspace(props({ status: "archived", q: "Archived" })));
    expect(markup).toContain("Archived supplier");
    expect(markup).not.toContain("Active supplier</strong>");
    expect(markup).not.toContain("Add a supplier");
    expect(markup).not.toContain("Rename Archived supplier");
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
