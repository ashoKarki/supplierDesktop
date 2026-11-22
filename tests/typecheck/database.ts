import type { createSupabaseServerClient } from "../../src/lib/supabase/server";

declare const client: Awaited<ReturnType<typeof createSupabaseServerClient>>;

client.from("suppliers").insert({ company_id: "company-id", name: "Supplier" });
client.rpc("create_owner_workspace");
client.rpc("create_owner_workspace", {});
client.from("document_requirements").insert({ company_id: "company-id", name: "ISO 9001", renewal_months: 12 });

export const supplierQuery = client.from("suppliers").select("id, name").single();
type SupplierResult = NonNullable<Awaited<typeof supplierQuery>["data"]>;
type IsAny<T> = 0 extends 1 & T ? true : false;
type Assert<T extends true> = T;
export type SupplierResultIsTyped = Assert<IsAny<SupplierResult> extends false ? true : false>;
export type SupplierColumnsAreTyped = Assert<
  SupplierResult extends { id: string; name: string } ? true : false
>;

// @ts-expect-error: Unknown tables must not be accepted.
client.from("unknown_table");
// @ts-expect-error: Supplier inserts require a company ID.
client.from("suppliers").insert({ name: "Supplier" });
// @ts-expect-error: Unknown supplier fields must not be accepted.
client.from("suppliers").insert({ company_id: "company-id", name: "Supplier", unexpected: true });
// @ts-expect-error: Archived timestamps cannot be arrays.
client.from("suppliers").update({ archived_at: [] });
// @ts-expect-error: Renewal periods are stored as numbers.
client.from("document_requirements").insert({ company_id: "company-id", name: "ISO 9001", renewal_months: "12" });
// @ts-expect-error: A request item must belong to a request.
client.from("document_request_items").insert({ company_id: "company-id", requirement_id: "requirement-id" });
// @ts-expect-error: Unknown database functions must not be accepted.
client.rpc("unknown_function");
// @ts-expect-error: Workspace creation does not accept arguments.
client.rpc("create_owner_workspace", { company_id: "company-id" });
