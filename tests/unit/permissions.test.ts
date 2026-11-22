import { describe, expect, it } from "vitest";
import { actions, can, type Action, type Role } from "../../src/lib/security/permissions";

describe("workspace permissions", () => {
  const cases: [Role, Action, boolean][] = [
    ["owner", "manage_billing", true],
    ["admin", "invite_employees", true],
    ["quality_manager", "review_documents", true],
    ["quality_manager", "manage_billing", false],
    ["procurement_manager", "manage_suppliers", true],
    ["procurement_manager", "review_documents", false],
    ["viewer", "view_workspace", true],
    ["viewer", "manage_suppliers", false],
    ["viewer", "invite_employees", false],
  ];

  it.each(cases)("%s / %s is %s", (role, action, expected) => {
    expect(can(role, action)).toBe(expected);
  });

  it.each<[Role, readonly Action[]]>([
    ["owner", actions],
    ["admin", actions],
    ["quality_manager", ["view_workspace", "manage_requirements", "manage_requests", "review_documents", "export_data"]],
    ["procurement_manager", ["view_workspace", "manage_suppliers", "manage_requests", "export_data"]],
    ["viewer", ["view_workspace"]],
  ])("restricts all actions for %s", (role, allowed) => {
    expect(actions.filter((action) => can(role, action))).toEqual(allowed);
  });
});
