export const roles = [
  "owner",
  "admin",
  "quality_manager",
  "procurement_manager",
  "viewer",
] as const;

export const actions = [
  "view_workspace",
  "manage_company",
  "invite_employees",
  "manage_billing",
  "manage_suppliers",
  "manage_requirements",
  "manage_requests",
  "review_documents",
  "export_data",
] as const;

export type Role = (typeof roles)[number];
export type Action = (typeof actions)[number];

const permissions: Record<Role, readonly Action[]> = {
  owner: actions,
  admin: actions,
  quality_manager: [
    "view_workspace",
    "manage_requirements",
    "manage_requests",
    "review_documents",
    "export_data",
  ],
  procurement_manager: [
    "view_workspace",
    "manage_suppliers",
    "manage_requests",
    "export_data",
  ],
  viewer: ["view_workspace"],
};

export function can(role: Role, action: Action): boolean {
  return permissions[role].includes(action);
}
