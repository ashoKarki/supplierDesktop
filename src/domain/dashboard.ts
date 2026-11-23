import { classifyExpiry } from "./document-expiry";
import type { DocumentStatus } from "./document-state";

export type Supplier = { id: string; name: string; archived_at: string | null };
export type Requirement = { id: string; name: string };
export type Request = { id: string; supplier_id: string; created_at: string; deadline: string | null };
export type Item = {
  id: string;
  request_id: string;
  requirement_id: string;
  status: Exclude<DocumentStatus, "superseded">;
  expires_on: string | null;
};

function timestampOrder(value: string) {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) throw new Error("Dashboard request date is invalid");
  const fraction = value.match(/\.(\d+)(?:Z|[+-]\d{2}(?::?\d{2})?)$/i)?.[1] ?? "";
  const subMillisecond = fraction.padEnd(9, "0").slice(3, 9);
  return { milliseconds, subMillisecond };
}

export type WorkspaceDocuments = {
  suppliers: Supplier[];
  requirements: Requirement[];
  requests: Request[];
  items: Item[];
};

export function currentDocuments(input: WorkspaceDocuments) {
  const suppliers = new Map(input.suppliers.map((supplier) => [supplier.id, supplier]));
  const requirements = new Map(input.requirements.map((requirement) => [requirement.id, requirement]));
  const requests = new Map(input.requests.map((request) => [request.id, request]));
  const latest = new Map<string, { item: Item; request: Request; supplier: Supplier; requirement: Requirement }>();
  for (const item of input.items) {
    const request = requests.get(item.request_id);
    if (!request) throw new Error("Dashboard request data is incomplete");
    const supplier = suppliers.get(request.supplier_id);
    if (!supplier) throw new Error("Dashboard supplier data is incomplete");
    if (supplier.archived_at !== null) continue;
    const requirement = requirements.get(item.requirement_id);
    if (!requirement) throw new Error("Dashboard requirement data is incomplete");
    const createdAt = timestampOrder(request.created_at);
    const key = JSON.stringify([supplier.id, requirement.id]);
    const previous = latest.get(key);
    const previousTime = previous ? timestampOrder(previous.request.created_at) : null;
    if (!previous || !previousTime || createdAt.milliseconds > previousTime.milliseconds
      || (createdAt.milliseconds === previousTime.milliseconds && createdAt.subMillisecond > previousTime.subMillisecond)
      || (createdAt.milliseconds === previousTime.milliseconds && createdAt.subMillisecond === previousTime.subMillisecond
        && request.id > previous.request.id)) {
      latest.set(key, { item, request, supplier, requirement });
    }
  }

  return [...latest.values()].filter(({ item }) => item.status !== "cancelled");
}

export function buildDashboard(input: WorkspaceDocuments & { now: Date; timeZone: string }) {
  const active = input.suppliers.filter((supplier) => supplier.archived_at === null);
  const latest = currentDocuments(input);
  let missing = 0;
  let pending = 0;
  let rejected = 0;
  let expired = 0;
  const overdueRequests = new Set<string>();
  const expiring: { itemId: string; requestId: string; supplier: string; requirement: string; date: string }[] = [];
  const expiryCounts = { within7: 0, within30: 0, within60: 0, within90: 0 };
  for (const { item, request, supplier, requirement } of latest) {
    if (item.status === "requested") missing++;
    if (item.status === "submitted" || item.status === "under_review") pending++;
    if (item.status === "rejected") rejected++;
    if ((item.status === "requested" || item.status === "rejected") && request.deadline
      && classifyExpiry(request.deadline, input.now, input.timeZone) === "expired") {
      overdueRequests.add(request.id);
    }
    if (item.status === "expired") {
      expired++;
    } else if (item.status === "approved" && item.expires_on) {
      const expiry = classifyExpiry(item.expires_on, input.now, input.timeZone);
      if (expiry === "expired") expired++;
      else if (expiry !== "valid") {
        expiryCounts.within90++;
        if (expiry !== "within_90_days") expiryCounts.within60++;
        if (expiry === "within_30_days" || expiry === "within_7_days") expiryCounts.within30++;
        if (expiry === "within_7_days") expiryCounts.within7++;
        expiring.push({
          itemId: item.id, requestId: request.id, supplier: supplier.name,
          requirement: requirement.name, date: item.expires_on,
        });
      }
    }
  }
  expiring.sort((a, b) => a.date.localeCompare(b.date) || a.supplier.localeCompare(b.supplier)
    || a.requirement.localeCompare(b.requirement) || a.itemId.localeCompare(b.itemId));
  return {
    totalSuppliers: input.suppliers.length,
    activeSuppliers: active.length,
    missing,
    pending,
    rejected,
    overdueRequests: overdueRequests.size,
    expired,
    expiryCounts,
    expiring,
  };
}
