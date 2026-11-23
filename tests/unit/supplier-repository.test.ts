import { createClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "../../src/lib/supabase/database.types";

vi.mock("server-only", () => ({}));
import { supplierRepository } from "../../src/lib/supabase/suppliers";

const fetchMock = vi.fn<typeof globalThis.fetch>();
const companyId = "d9aa6857-7de8-4771-8c82-aa114a916431";
const supplierId = "25fb6029-c79a-4227-bd61-2e5ad1867ead";

function repository() {
  return supplierRepository(createClient<Database>("http://localhost:54321", "test-anon-key", {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { fetch: fetchMock },
  }));
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe("supplier repository", () => {
  it("looks up the role within the specified company and user", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ role: "owner" }));
    expect(await repository().roleFor("user-id", companyId)).toBe("owner");
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.searchParams.get("company_id")).toBe(`eq.${companyId}`);
    expect(url.searchParams.get("user_id")).toBe("eq.user-id");
  });

  it("returns no role for a missing membership and surfaces lookup failures", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(null));
    expect(await repository().roleFor("user-id", companyId)).toBeNull();
    fetchMock.mockResolvedValueOnce(jsonResponse({ code: "DB_ERROR", message: "failed" }, 400));
    await expect(repository().roleFor("user-id", companyId)).rejects.toThrow("Unable to check workspace permissions");
  });

  it("handles capacity limits without treating other database errors as capacity failures", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ code: "P1001", message: "limit" }, 400));
    expect(await repository().create(companyId, "Supplier")).toBe("limit_reached");
    fetchMock.mockResolvedValueOnce(jsonResponse({ code: "OTHER", message: "failed" }, 400));
    await expect(repository().create(companyId, "Supplier")).rejects.toThrow("Unable to create supplier");
  });

  it("creates a supplier under the selected company", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 201 }));
    expect(await repository().create(companyId, "Supplier")).toBe(true);
    const body = fetchMock.mock.calls[0]?.[1]?.body;
    expect(body).toBe(JSON.stringify({ company_id: companyId, name: "Supplier" }));
  });

  it.each(["rename", "archive"] as const)("%s scopes changes to the company and supplier", async (action) => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: supplierId }));
    const repo = repository();
    const result = action === "rename"
      ? await repo.rename(companyId, supplierId, "New name")
      : await repo.archive(companyId, supplierId);
    expect(result).toBe(true);
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.searchParams.get("company_id")).toBe(`eq.${companyId}`);
    expect(url.searchParams.get("id")).toBe(`eq.${supplierId}`);
  });

  it.each(["rename", "archive"] as const)("%s returns false for a row hidden by RLS", async (action) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(null));
    const repo = repository();
    const result = action === "rename"
      ? await repo.rename(companyId, supplierId, "New name")
      : await repo.archive(companyId, supplierId);
    expect(result).toBe(false);
  });

  it.each(["rename", "archive"] as const)("%s surfaces database failures", async (action) => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ code: "DB_ERROR", message: "failed" }, 400));
    const repo = repository();
    const operation = action === "rename"
      ? repo.rename(companyId, supplierId, "New name")
      : repo.archive(companyId, supplierId);
    await expect(operation).rejects.toThrow(action === "rename" ? "Unable to update supplier" : "Unable to archive supplier");
  });

  it("updates contacts only for active suppliers in the selected workspace", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: supplierId }));
    expect(await repository().updateContact(companyId, supplierId, "a@example.com")).toBe(true);
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.searchParams.get("company_id")).toBe(`eq.${companyId}`);
    expect(url.searchParams.get("id")).toBe(`eq.${supplierId}`);
    expect(url.searchParams.get("archived_at")).toBe("is.null");
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ contact_email: "a@example.com" }));
    fetchMock.mockResolvedValueOnce(jsonResponse(null));
    expect(await repository().updateContact(companyId, supplierId, null)).toBe(false);
    fetchMock.mockResolvedValueOnce(jsonResponse({ code: "DB_ERROR", message: "failed" }, 400));
    await expect(repository().updateContact(companyId, supplierId, null)).rejects.toThrow("Unable to update supplier contact");
  });
});
