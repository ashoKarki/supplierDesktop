import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  roleFor: vi.fn(),
  create: vi.fn(),
  rename: vi.fn(),
  archive: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  maybeSingle: vi.fn(),
  revalidate: vi.fn(),
  redirect: vi.fn((path: string): never => { throw new Error(`REDIRECT ${path}`); }),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/supabase/require-user", () => ({ requireUser: () => ({ id: "user-id" }) }));
vi.mock("@/lib/supabase/suppliers", () => ({
  supplierRepository: () => ({
    roleFor: mocks.roleFor, create: mocks.create, rename: mocks.rename, archive: mocks.archive,
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => ({
    from: () => ({
      insert: mocks.insert, update: mocks.update, eq: mocks.eq,
      select: mocks.select, maybeSingle: mocks.maybeSingle,
    }),
  }),
}));

import { updateSupplier } from "../../src/app/workspace/[companyId]/actions";
import { addRequirement } from "../../src/app/workspace/[companyId]/requirements/actions";
import { saveCompanyProfile } from "../../src/app/workspace/[companyId]/settings/actions";

const companyId = "d9aa6857-7de8-4771-8c82-aa114a916431";
const path = `/workspace/${companyId}`;

function form(values: Record<string, string>) {
  const result = new FormData();
  for (const [key, value] of Object.entries(values)) result.set(key, value);
  return result;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.roleFor.mockResolvedValue("owner");
  mocks.create.mockResolvedValue(true);
  mocks.insert.mockResolvedValue({ error: null });
  const query = { update: mocks.update, eq: mocks.eq, select: mocks.select, maybeSingle: mocks.maybeSingle };
  mocks.update.mockReturnValue(query);
  mocks.eq.mockReturnValue(query);
  mocks.select.mockReturnValue(query);
  mocks.maybeSingle.mockResolvedValue({ data: { id: companyId }, error: null });
});

describe("workspace actions", () => {
  it("denies supplier changes to a viewer", async () => {
    mocks.roleFor.mockResolvedValue("viewer");
    await expect(updateSupplier(form({ companyId, action: "create", name: "Supplier" })))
      .rejects.toThrow(`REDIRECT ${path}?error=forbidden`);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("creates a supplier in the authorized workspace", async () => {
    await expect(updateSupplier(form({ companyId, action: "create", name: "Supplier" })))
      .rejects.toThrow(`REDIRECT ${path}`);
    expect(mocks.create).toHaveBeenCalledWith(companyId, "Supplier");
    expect(mocks.revalidate).toHaveBeenCalledWith(path);
  });

  it("denies requirement creation to a viewer", async () => {
    mocks.roleFor.mockResolvedValue("viewer");
    await expect(addRequirement(form({ companyId, name: "Certificate", renewalMonths: "12" })))
      .rejects.toThrow(`REDIRECT ${path}/requirements?error=1`);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("creates a requirement in the authorized workspace", async () => {
    await expect(addRequirement(form({ companyId, name: "Certificate", renewalMonths: "12" })))
      .rejects.toThrow(`REDIRECT ${path}/requirements`);
    expect(mocks.insert).toHaveBeenCalledWith({ company_id: companyId, name: "Certificate", renewal_months: 12 });
    expect(mocks.revalidate).toHaveBeenCalledWith(`${path}/requirements`);
  });

  it("surfaces requirement database errors", async () => {
    mocks.insert.mockResolvedValue({ error: { code: "failed" } });
    await expect(addRequirement(form({ companyId, name: "Certificate", renewalMonths: "12" })))
      .rejects.toThrow("Unable to create requirement");
  });

  it("denies profile changes to a viewer", async () => {
    mocks.roleFor.mockResolvedValue("viewer");
    await expect(saveCompanyProfile(form({ companyId, companyName: "Example", country: "DE", businessDetails: "Business" })))
      .rejects.toThrow(`REDIRECT ${path}/settings?error=1`);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("updates the selected company profile for an owner", async () => {
    await expect(saveCompanyProfile(form({ companyId, companyName: "Example", country: "DE", businessDetails: "Business" })))
      .rejects.toThrow(`REDIRECT ${path}/settings?saved=1`);
    expect(mocks.update).toHaveBeenCalledWith({ name: "Example", country: "DE", business_details: "Business" });
    expect(mocks.eq).toHaveBeenCalledWith("id", companyId);
    expect(mocks.revalidate).toHaveBeenCalledWith("/workspace", "layout");
  });

  it("surfaces profile database errors", async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: { code: "failed" } });
    await expect(saveCompanyProfile(form({ companyId, companyName: "Example", country: "DE", businessDetails: "Business" })))
      .rejects.toThrow("Unable to update company profile");
  });
});
