import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import { Icon } from "@/components/icons";
import { WorkspaceShell } from "@/components/workspace-shell";
import { filterSuppliers } from "@/domain/supplier-search";
import { can } from "@/lib/security/permissions";
import { requireUser } from "@/lib/supabase/require-user";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supplierRepository } from "@/lib/supabase/suppliers";
import { loadSupplierPages } from "@/services/supplier-list";
import { updateSupplier } from "./actions";

const companySchema = z.object({ id: z.string().uuid(), name: z.string() });
const suppliersSchema = z.array(z.object({
  id: z.string().uuid(),
  name: z.string(),
  archived_at: z.string().nullable(),
}));

export default async function CompanyWorkspace({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ q?: string; status?: string; error?: string }>;
}) {
  await connection();
  const companyId = z.string().uuid().safeParse((await params).companyId);
  if (!companyId.success) notFound();

  const client = await createSupabaseServerClient();
  const user = await requireUser(client);
  const role = await supplierRepository(client).roleFor(user.id, companyId.data);
  if (!role || !can(role, "view_workspace")) notFound();

  const { data: companyData, error: companyError } = await client.from("companies")
    .select("id, name").eq("id", companyId.data).maybeSingle();
  if (companyError) {
    console.error("Workspace lookup failed", { code: companyError.code });
    throw new Error("Unable to load workspace");
  }
  if (!companyData) notFound();
  const company = companySchema.parse(companyData);
  const supplierData = await loadSupplierPages(async (after) => {
    let request = client.from("suppliers").select("id, name, archived_at")
      .eq("company_id", companyId.data).order("id").limit(200);
    if (after) request = request.gt("id", after);
    const { data, error } = await request;
    if (error) {
      console.error("Supplier list failed", { code: error.code });
      throw new Error("Unable to load suppliers");
    }
    return suppliersSchema.parse(data);
  });
  const search = await searchParams;
  const query = typeof search.q === "string" ? search.q.trim().slice(0, 200) : "";
  const status = search.status === "archived" || search.status === "all" ? search.status : "active";
  const suppliers = filterSuppliers(supplierData, query, status)
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const canEdit = can(role, "manage_suppliers");
  const activeCount = supplierData.filter((supplier) => supplier.archived_at === null).length;
  const archivedCount = supplierData.length - activeCount;

  return (
    <WorkspaceShell companyName={company.name} companyId={company.id} role={role}>
      <div className="workspace-heading">
        <div>
          <p className="eyebrow">SUPPLIER DIRECTORY</p>
          <h1>Suppliers</h1>
          <p>Manage and organize suppliers for {company.name}.</p>
        </div>
        <Link className="back-link" href="/workspace">All workspaces <Icon name="arrowUpRight" /></Link>
      </div>
      <div className="summary-grid" aria-label="Supplier overview">
        <div className="summary-card"><span className="summary-icon sage"><Icon name="users" /></span><div><span>Total suppliers</span><strong>{supplierData.length}</strong></div></div>
        <div className="summary-card"><span className="summary-icon blue"><Icon name="check" /></span><div><span>Active suppliers</span><strong>{activeCount}</strong></div></div>
        <div className="summary-card"><span className="summary-icon sand"><Icon name="file" /></span><div><span>Archived suppliers</span><strong>{archivedCount}</strong></div></div>
      </div>
      {search.error && <p role="alert" className="form-alert workspace-alert"><Icon name="warning" /> The supplier change could not be completed.</p>}
      {canEdit && (
        <div className="add-supplier-card">
          <div><h2>Add a supplier</h2><p>Start by adding a name to your directory.</p></div>
          <form action={updateSupplier} className="add-supplier-form">
            <input type="hidden" name="companyId" value={company.id} />
            <input type="hidden" name="action" value="create" />
            <label className="sr-only" htmlFor="new-supplier">New supplier name</label>
            <input id="new-supplier" name="name" placeholder="Supplier name" required maxLength={200} />
            <button className="button button-dark button-small" type="submit"><Icon name="plus" /> Add supplier</button>
          </form>
        </div>
      )}
      <section className="directory-card" aria-labelledby="directory-title">
        <div className="directory-heading">
          <div><h2 id="directory-title">Supplier directory <span className="count-pill">{suppliers.length}</span></h2><p>Search and manage your company&apos;s suppliers.</p></div>
        </div>
        <form className="directory-filters">
          <label className="search-field" htmlFor="supplier-search"><Icon name="search" /><span className="sr-only">Search suppliers</span><input id="supplier-search" name="q" placeholder="Search suppliers..." defaultValue={query} maxLength={200} /></label>
          <label className="sr-only" htmlFor="supplier-status">Status</label>
          <select id="supplier-status" name="status" defaultValue={status}>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
            <option value="all">All suppliers</option>
          </select>
          <button className="button button-outline button-small" type="submit">Apply filters</button>
        </form>
        {suppliers.length === 0 ? (
          <div className="empty-state"><span className="empty-icon"><Icon name="search" /></span><h3>No suppliers found</h3><p>Try a different search or status filter{canEdit ? ", or add a new supplier above" : ""}.</p></div>
        ) : (
          <ul className="supplier-list">
            {suppliers.map((supplier) => (
              <li className="supplier-row" key={supplier.id}>
                <div className="supplier-identity">
                  <span className="supplier-avatar"><Icon name="building" /></span>
                  <div><strong>{supplier.name}</strong><span className={`status-label${supplier.archived_at ? " archived" : ""}`}><span />{supplier.archived_at ? "Archived" : "Active"}</span></div>
                </div>
                {canEdit && !supplier.archived_at && (
                  <div className="supplier-actions">
                    <form action={updateSupplier} className="rename-form">
                      <input type="hidden" name="companyId" value={company.id} />
                      <input type="hidden" name="supplierId" value={supplier.id} />
                      <input type="hidden" name="action" value="rename" />
                      <label className="sr-only" htmlFor={`rename-${supplier.id}`}>Rename {supplier.name}</label>
                      <input id={`rename-${supplier.id}`} name="name" defaultValue={supplier.name} required maxLength={200} />
                      <button className="button button-outline button-small" type="submit">Save</button>
                    </form>
                    <form action={updateSupplier}>
                      <input type="hidden" name="companyId" value={company.id} />
                      <input type="hidden" name="supplierId" value={supplier.id} />
                      <input type="hidden" name="action" value="archive" />
                      <button className="archive-button" type="submit">Archive</button>
                    </form>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </WorkspaceShell>
  );
}
