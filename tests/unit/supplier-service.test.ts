import { describe, expect, it, vi } from "vitest";
import { manageSupplier } from "../../src/services/suppliers";

const companyId = "d9aa6857-7de8-4771-8c82-aa114a916431";
const supplierId = "25fb6029-c79a-4227-bd61-2e5ad1867ead";
const userId = "9dccba2a-64a8-457b-91a6-aa2c1fea13e4";

function repository(role: "owner" | "viewer" | null) {
  return {
    roleFor: vi.fn().mockResolvedValue(role),
    create: vi.fn().mockResolvedValue(true),
    rename: vi.fn().mockResolvedValue(true),
    archive: vi.fn().mockResolvedValue(true),
  };
}

describe("supplier management", () => {
  it("creates a supplier under the authorized company with a normalized name", async () => {
    const repo = repository("owner");
    const result = await manageSupplier(
      { action: "create", companyId, name: "  Parts Ltd  " },
      userId,
      repo,
    );
    expect(result).toEqual({ ok: true });
    expect(repo.roleFor).toHaveBeenCalledWith(userId, companyId);
    expect(repo.create).toHaveBeenCalledWith(companyId, "Parts Ltd");
  });

  it.each(["viewer", null] as const)("rejects supplier writes for %s", async (role) => {
    const repo = repository(role);
    expect(await manageSupplier({ action: "archive", companyId, supplierId }, userId, repo))
      .toEqual({ ok: false, reason: "forbidden" });
    expect(repo.archive).not.toHaveBeenCalled();
  });

  it("rejects malformed or empty input before querying the repository", async () => {
    const repo = repository("owner");
    expect(await manageSupplier({ action: "create", companyId, name: "  " }, userId, repo))
      .toEqual({ ok: false, reason: "invalid" });
    expect(repo.roleFor).not.toHaveBeenCalled();
  });

  it("scopes edits to the selected company and reports missing records", async () => {
    const repo = repository("owner");
    repo.rename.mockResolvedValue(false);
    expect(await manageSupplier({ action: "rename", companyId, supplierId, name: "New name" }, userId, repo))
      .toEqual({ ok: false, reason: "not_found" });
    expect(repo.rename).toHaveBeenCalledWith(companyId, supplierId, "New name");
  });

  it("reports the workspace supplier limit", async () => {
    const repo = repository("owner");
    repo.create.mockResolvedValue("limit_reached");
    expect(await manageSupplier({ action: "create", companyId, name: "One more" }, userId, repo))
      .toEqual({ ok: false, reason: "limit_reached" });
  });
});
