import { describe, expect, it, vi } from "vitest";
import { updateCompanyProfile, type CompanyProfileRepository } from "../../src/services/company-profile";

const companyId = "d9aa6857-7de8-4771-8c82-aa114a916431";
const userId = "9dccba2a-64a8-457b-91a6-aa2c1fea13e4";
const input = { companyId, companyName: "  Example Ltd  ", country: "AT", businessDetails: "  Manufacturer  " };

function repository(role: Awaited<ReturnType<CompanyProfileRepository["roleFor"]>>) {
  return {
    roleFor: vi.fn<CompanyProfileRepository["roleFor"]>().mockResolvedValue(role),
    update: vi.fn<CompanyProfileRepository["update"]>().mockResolvedValue(true),
  };
}

describe("company profile", () => {
  it.each(["owner", "admin"] as const)("allows %s to update normalized company details", async (role) => {
    const repo = repository(role);
    expect(await updateCompanyProfile(input, userId, repo)).toEqual({ ok: true });
    expect(repo.update).toHaveBeenCalledWith(companyId, {
      companyName: "Example Ltd", country: "AT", businessDetails: "Manufacturer",
    });
  });

  it.each(["viewer", "quality_manager", "procurement_manager", null] as const)("rejects %s", async (role) => {
    const repo = repository(role);
    expect(await updateCompanyProfile(input, userId, repo)).toEqual({ ok: false, reason: "forbidden" });
    expect(repo.update).not.toHaveBeenCalled();
  });

  it("rejects invalid company details before checking permissions", async () => {
    const repo = repository("owner");
    expect(await updateCompanyProfile({ ...input, country: "xx", companyName: " " }, userId, repo))
      .toEqual({ ok: false, reason: "invalid" });
    expect(repo.roleFor).not.toHaveBeenCalled();
  });

  it("reports when the company is no longer available", async () => {
    const repo = repository("admin");
    repo.update.mockResolvedValue(false);
    expect(await updateCompanyProfile(input, userId, repo)).toEqual({ ok: false, reason: "not_found" });
  });
});
