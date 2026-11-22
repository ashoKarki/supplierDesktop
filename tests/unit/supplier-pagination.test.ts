import { describe, expect, it, vi } from "vitest";
import { loadSupplierPages } from "../../src/services/supplier-list";

describe("supplier list pagination", () => {
  it("continues after short pages until the database returns no more rows", async () => {
    const fetchPage = vi.fn()
      .mockResolvedValueOnce([{ id: "a" }])
      .mockResolvedValueOnce([{ id: "b" }])
      .mockResolvedValueOnce([]);
    expect(await loadSupplierPages(fetchPage)).toEqual([{ id: "a" }, { id: "b" }]);
    expect(fetchPage.mock.calls).toEqual([[null], ["a"], ["b"]]);
  });

  it("fails rather than looping if a page does not advance", async () => {
    const fetchPage = vi.fn().mockResolvedValue([{ id: "a" }]);
    await expect(loadSupplierPages(fetchPage)).rejects.toThrow("Supplier pagination did not advance");
  });
});
