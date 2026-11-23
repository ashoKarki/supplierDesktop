import { currentDocuments, type WorkspaceDocuments } from "./dashboard";
import { classifyExpiry, daysUntilDate } from "./document-expiry";

type Status = "Action required" | "Expired" | "Incomplete" | "Pending review" | "Expiring" | "Complete" | "Not assessed";
const priority: Status[] = ["Action required", "Expired", "Incomplete", "Pending review", "Expiring", "Complete"];

export function buildReports(data: WorkspaceDocuments, now: Date, timeZone: string) {
  const documents = currentDocuments(data);
  const compliance = data.suppliers.filter((supplier) => supplier.archived_at === null).map((supplier) => {
    const items = documents.filter((document) => document.supplier.id === supplier.id);
    const statuses: Status[] = items.map(({ item }) => {
      if (item.status === "rejected") return "Action required";
      if (item.status === "expired") return "Expired";
      if (item.status === "requested") return "Incomplete";
      if (item.status === "submitted" || item.status === "under_review") return "Pending review";
      if (item.expires_on) {
        const expiry = classifyExpiry(item.expires_on, now, timeZone);
        if (expiry === "expired") return "Expired";
        if (expiry !== "valid") return "Expiring";
      }
      return "Complete";
    });
    const status = priority.find((value) => statuses.includes(value)) ?? "Not assessed";
    return {
      supplier: supplier.name,
      required: items.length,
      approved: items.filter(({ item }) => item.status === "approved"
        && (!item.expires_on || classifyExpiry(item.expires_on, now, timeZone) !== "expired")).length,
      missing: items.filter(({ item }) => item.status === "requested").length,
      expired: statuses.filter((value) => value === "Expired").length,
      status,
    };
  });
  const expiry = documents.flatMap(({ item, supplier, requirement }) => {
    if (item.status !== "approved" && item.status !== "expired") return [];
    if (!item.expires_on && item.status !== "expired") return [];
    const days = item.expires_on ? daysUntilDate(item.expires_on, now, timeZone) : null;
    const status = item.status === "expired" || (days !== null && days < 0)
      ? "Expired" : days !== null && days <= 90 ? "Expiring" : "Valid";
    return [{ supplier: supplier.name, document: requirement.name, date: item.expires_on, days, status }];
  });
  const outstanding = documents.flatMap(({ item, supplier, requirement, request }) => {
    if (item.status !== "requested" && item.status !== "rejected") return [];
    const overdue = request.deadline !== null && daysUntilDate(request.deadline, now, timeZone) < 0;
    return [{
      supplier: supplier.name, document: requirement.name, requested: request.created_at,
      deadline: request.deadline, status: overdue ? "Overdue" : item.status === "rejected" ? "Action required" : "Outstanding",
    }];
  });
  compliance.sort((a, b) => a.supplier.localeCompare(b.supplier));
  expiry.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || a.supplier.localeCompare(b.supplier));
  outstanding.sort((a, b) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999") || a.supplier.localeCompare(b.supplier));
  return { compliance, expiry, outstanding };
}
