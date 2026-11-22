import { describe, expect, it } from "vitest";
import { filterSuppliers } from "../../src/domain/supplier-search";

const suppliers = [
  { name: "Müller Components", archived_at: null },
  { name: "Müller Archive", archived_at: "2026-01-01T00:00:00Z" },
  { name: "Other", archived_at: null },
];

describe("supplier search", () => {
  it("searches case-insensitively and ignores surrounding whitespace", () => {
    expect(filterSuppliers(suppliers, "  MÜLLER  ", "active")).toEqual([suppliers[0]]);
  });

  it("filters archived suppliers separately", () => {
    expect(filterSuppliers(suppliers, "", "archived")).toEqual([suppliers[1]]);
    expect(filterSuppliers(suppliers, "", "all")).toEqual(suppliers);
  });
});
