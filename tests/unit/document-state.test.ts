import { describe, expect, it } from "vitest";
import {
  DocumentTransitionError,
  documentStatuses,
  transitionDocument,
  type DocumentStatus,
} from "../../src/domain/document-state";

describe("document state transitions", () => {
  const allowed: [DocumentStatus, DocumentStatus][] = [
    ["requested", "submitted"],
    ["requested", "cancelled"],
    ["submitted", "under_review"],
    ["submitted", "cancelled"],
    ["under_review", "approved"],
    ["under_review", "rejected"],
    ["under_review", "cancelled"],
    ["rejected", "submitted"],
    ["rejected", "cancelled"],
    ["approved", "expired"],
    ["approved", "superseded"],
    ["expired", "superseded"],
  ];

  it.each(allowed)("allows %s to %s", (from, to) => {
    expect(transitionDocument(from, to, { reason: "Needs correction" })).toEqual(to);
  });

  it("requires a nonblank reason for rejection", () => {
    expect(() => transitionDocument("under_review", "rejected", { reason: "  " }))
      .toThrow(DocumentTransitionError);
    expect(() => transitionDocument("under_review", "rejected"))
      .toThrow(DocumentTransitionError);
  });

  it.each<[DocumentStatus, DocumentStatus]>([
    ["requested", "approved"],
    ["submitted", "approved"],
    ["cancelled", "submitted"],
    ["superseded", "approved"],
    ["approved", "approved"],
    ["expired", "approved"],
  ])("rejects %s to %s", (from, to) => {
    expect(() => transitionDocument(from, to, { reason: "reason" }))
      .toThrow(DocumentTransitionError);
  });

  it("rejects every transition outside the allowed matrix", () => {
    for (const from of documentStatuses) {
      for (const to of documentStatuses) {
        if (!allowed.some(([source, destination]) => source === from && destination === to)) {
          expect(() => transitionDocument(from, to, { reason: "reason" }))
            .toThrow(DocumentTransitionError);
        }
      }
    }
  });
});
