import { describe, expect, it, vi } from "vitest";
import { createRequirement, type RequirementRepository } from "../../src/services/requirements";

const companyId = "d9aa6857-7de8-4771-8c82-aa114a916431";
const userId = "9dccba2a-64a8-457b-91a6-aa2c1fea13e4";
const input = { companyId, name: " ISO 9001 ", renewalMonths: "12" };

function repository(role: Awaited<ReturnType<RequirementRepository["roleFor"]>>) {
  return {
    roleFor: vi.fn<RequirementRepository["roleFor"]>().mockResolvedValue(role),
    create: vi.fn<RequirementRepository["create"]>().mockResolvedValue(undefined),
  };
}

describe("create requirement", () => {
  it("validates and creates requirements for a quality manager", async () => {
    const repo = repository("quality_manager");
    expect(await createRequirement(input, userId, repo)).toEqual({ ok: true });
    expect(repo.roleFor).toHaveBeenCalledWith(userId, companyId);
    expect(repo.create).toHaveBeenCalledWith(companyId, { name: "ISO 9001", renewalMonths: 12 });
  });

  it.each(["viewer", "procurement_manager", null] as const)("rejects writes for %s", async (role) => {
    const repo = repository(role);
    expect(await createRequirement(input, userId, repo)).toEqual({ ok: false, reason: "forbidden" });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it.each(["", "1.5", "1e2", "0", "121"])("rejects invalid renewal value %s", async (value) => {
    const repo = repository("owner");
    expect(await createRequirement({ ...input, renewalMonths: value }, userId, repo))
      .toEqual({ ok: false, reason: "invalid" });
    expect(repo.roleFor).not.toHaveBeenCalled();
  });
});
