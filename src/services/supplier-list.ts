export async function loadSupplierPages<T extends { id: string }>(
  fetchPage: (after: string | null) => Promise<T[]>,
): Promise<T[]> {
  const result: T[] = [];
  let cursor: string | null = null;
  for (;;) {
    const page = await fetchPage(cursor);
    if (page.length === 0) return result;
    for (const item of page) {
      if (cursor !== null && item.id <= cursor) {
        throw new Error("Supplier pagination did not advance");
      }
      result.push(item);
      cursor = item.id;
    }
  }
}
