export type SupplierFilter = "active" | "archived" | "all";

export function filterSuppliers<T extends { name: string; archived_at: string | null }>(
  suppliers: readonly T[],
  query: string,
  filter: SupplierFilter,
): T[] {
  const search = query.trim().toLowerCase();
  return suppliers.filter((supplier) => {
    const matchesStatus = filter === "all" ||
      (filter === "archived" ? supplier.archived_at !== null : supplier.archived_at === null);
    return matchesStatus && supplier.name.toLowerCase().includes(search);
  });
}
