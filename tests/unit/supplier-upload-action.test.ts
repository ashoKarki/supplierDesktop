import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findLink: vi.fn(),
  store: vi.fn(),
  revalidate: vi.fn(),
  notFound: vi.fn((): never => { throw new Error("NOT_FOUND"); }),
  redirect: vi.fn((path: string): never => { throw new Error(`REDIRECT ${path}`); }),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound, redirect: mocks.redirect }));
vi.mock("@/lib/supabase/supplier-links", () => ({ findSupplierLink: mocks.findLink }));
vi.mock("@/services/document-uploads", () => ({ storeDocument: mocks.store }));

import { uploadSupplierDocument } from "../../src/app/supplier/upload/[token]/actions";

const companyId = "d9aa6857-7de8-4771-8c82-aa114a916431";
const itemId = "25fb6029-c79a-4227-bd61-2e5ad1867ead";
const token = "a".repeat(64);
const hash = "b".repeat(64);

function form() {
  const result = new FormData();
  result.set("token", token);
  result.set("itemId", itemId);
  result.set("lang", "de");
  result.set("expiresOn", "2027-01-01");
  result.set("file", new File(["%PDF-1"], "certificate.pdf", { type: "application/pdf" }));
  return result;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findLink.mockResolvedValue({ company_id: companyId, linkHash: hash });
  mocks.store.mockResolvedValue({ ok: true });
});

describe("supplier upload action", () => {
  it("rejects an inactive link before attempting an upload", async () => {
    mocks.findLink.mockResolvedValue(null);
    await expect(uploadSupplierDocument(form())).rejects.toThrow("NOT_FOUND");
    expect(mocks.store).not.toHaveBeenCalled();
  });

  it("rejects invalid item identifiers before attempting an upload", async () => {
    const invalid = form();
    invalid.set("itemId", "not-a-uuid");
    await expect(uploadSupplierDocument(invalid)).rejects.toThrow("NOT_FOUND");
    expect(mocks.store).not.toHaveBeenCalled();
  });

  it("preserves language and reports a storage failure without revalidating", async () => {
    mocks.store.mockResolvedValue({ ok: false, reason: "storage" });
    await expect(uploadSupplierDocument(form()))
      .rejects.toThrow(`REDIRECT /supplier/upload/${token}?lang=de&error=storage`);
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("submits within the resolved company and returns to the selected language", async () => {
    await expect(uploadSupplierDocument(form()))
      .rejects.toThrow(`REDIRECT /supplier/upload/${token}?lang=de&uploaded=1`);
    expect(mocks.store).toHaveBeenCalledWith(expect.objectContaining({
      companyId, itemId, actor: { kind: "supplier", linkHash: hash },
    }));
    expect(mocks.revalidate.mock.calls).toEqual([
      [`/workspace/${companyId}/requests`],
      [`/supplier/upload/${token}`],
    ]);
  });
});
