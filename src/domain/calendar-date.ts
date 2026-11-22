const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseCalendarDate(value: string): { year: number; month: number; day: number } {
  const match = datePattern.exec(value);
  if (!match) throw new RangeError("Invalid calendar date");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1000 || year > 9999 || month < 1 || month > 12) {
    throw new RangeError("Invalid calendar date");
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (day < 1 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new RangeError("Invalid calendar date");
  }
  return { year, month, day };
}
