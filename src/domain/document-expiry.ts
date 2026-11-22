import { parseCalendarDate } from "./calendar-date";

export type ExpiryStatus =
  | "expired"
  | "within_7_days"
  | "within_30_days"
  | "within_60_days"
  | "within_90_days"
  | "valid";

export function classifyExpiry(expiryDate: string, now: Date, timeZone: string): ExpiryStatus {
  const expiry = parseCalendarDate(expiryDate);
  if (!Number.isFinite(now.getTime())) throw new RangeError("Invalid clock");
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    calendar: "gregory",
  }).formatToParts(now);
  const part = (type: "year" | "month" | "day") => {
    const value = parts.find((entry) => entry.type === type)?.value;
    if (!value) throw new RangeError("Unable to resolve company calendar date");
    return Number(value);
  };
  const today = Date.UTC(part("year"), part("month") - 1, part("day"));
  const days = (Date.UTC(expiry.year, expiry.month - 1, expiry.day) - today) / 86_400_000;
  if (days < 0) return "expired";
  if (days <= 7) return "within_7_days";
  if (days <= 30) return "within_30_days";
  if (days <= 60) return "within_60_days";
  if (days <= 90) return "within_90_days";
  return "valid";
}
