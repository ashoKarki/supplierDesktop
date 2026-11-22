export const documentStatuses = [
  "requested",
  "submitted",
  "under_review",
  "approved",
  "rejected",
  "expired",
  "superseded",
  "cancelled",
] as const;

export type DocumentStatus = (typeof documentStatuses)[number];

const transitions: Record<DocumentStatus, readonly DocumentStatus[]> = {
  requested: ["submitted", "cancelled"],
  submitted: ["under_review", "cancelled"],
  under_review: ["approved", "rejected", "cancelled"],
  approved: ["expired", "superseded"],
  rejected: ["submitted", "cancelled"],
  expired: ["superseded"],
  superseded: [],
  cancelled: [],
};

export class DocumentTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentTransitionError";
  }
}

export function transitionDocument(
  from: DocumentStatus,
  to: DocumentStatus,
  options?: { reason?: string },
): DocumentStatus {
  if (!transitions[from].includes(to)) {
    throw new DocumentTransitionError(`Invalid document transition: ${from} to ${to}`);
  }
  if (to === "rejected" && !options?.reason?.trim()) {
    throw new DocumentTransitionError("Rejection requires a reason");
  }
  return to;
}
