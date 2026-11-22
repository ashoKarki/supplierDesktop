import { describe, expect, it, vi } from "vitest";
import { createDocumentRequest, type RequestRepository } from "../../src/services/requests";

const companyId = "d9aa6857-7de8-4771-8c82-aa114a916431";
const supplierId = "25fb6029-c79a-4227-bd61-2e5ad1867ead";
const requirementId = "9dccba2a-64a8-457b-91a6-aa2c1fea13e4";
const userId = "31300d34-5ebc-4e8c-ae86-dbe58d85ca0e";
const input = { companyId, supplierId, requirementIds: [requirementId] };

function repository(role: Awaited<ReturnType<RequestRepository["roleFor"]>>) {
  return {
    roleFor: vi.fn<RequestRepository["roleFor"]>().mockResolvedValue(role),
    create: vi.fn<RequestRepository["create"]>().mockResolvedValue(undefined),
  };
}

describe("create document request", () => {
  it("creates a scoped request for a procurement manager", async () => {
    const repo = repository("procurement_manager");
    expect(await createDocumentRequest(input, userId, repo)).toEqual({ ok: true });
    expect(repo.roleFor).toHaveBeenCalledWith(userId, companyId);
    expect(repo.create).toHaveBeenCalledWith(companyId, supplierId, [requirementId]);
  });

  it.each(["viewer", null] as const)("rejects request creation for %s", async (role) => {
    const repo = repository(role);
    expect(await createDocumentRequest(input, userId, repo)).toEqual({ ok: false, reason: "forbidden" });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it.each([
    { ...input, requirementIds: [] },
    { ...input, requirementIds: [requirementId, requirementId] },
    { ...input, supplierId: "invalid" },
  ])("rejects malformed or duplicate input before querying membership", async (value) => {
    const repo = repository("owner");
    expect(await createDocumentRequest(value, userId, repo)).toEqual({ ok: false, reason: "invalid" });
    expect(repo.roleFor).not.toHaveBeenCalled();
  });
});
