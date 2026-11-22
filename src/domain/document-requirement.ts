import { z } from "zod";
import { parseCalendarDate } from "./calendar-date";

export const documentRequirementSchema = z.object({
  name: z.string().trim().min(1).max(200),
  renewalMonths: z.number().int().min(1).max(120),
});

export function renewalDate(issueDate: string, renewalMonths: number): string {
  const { year, month, day } = parseCalendarDate(issueDate);
  const months = z.number().int().min(1).max(120).parse(renewalMonths);
  const index = month - 1 + months;
  const targetYear = year + Math.floor(index / 12);
  if (targetYear > 9999) throw new RangeError("Renewal date outside supported range");
  const targetMonth = (index % 12) + 1;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  return `${targetYear}-${String(targetMonth).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}
