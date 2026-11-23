type Cell = string | number | null;

export function reportCsv(rows: Cell[][]): string {
  return rows.map((row) => row.map((cell) => {
    let value = cell === null ? "" : String(cell);
    if (typeof cell === "string" && (/^[\t\r\n]/.test(value) || /^[\u0000-\u0020\uFEFF]*[=+\-@]/.test(value))) {
      value = `'${value}`;
    }
    return `"${value.replaceAll('"', '""')}"`;
  }).join(",")).join("\r\n") + "\r\n";
}
