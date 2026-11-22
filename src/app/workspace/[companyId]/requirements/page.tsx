import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import { Icon } from "@/components/icons";
import { WorkspaceShell } from "@/components/workspace-shell";
import { can } from "@/lib/security/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/require-user";
import { supplierRepository } from "@/lib/supabase/suppliers";
import { loadSupplierPages } from "@/services/supplier-list";
import { addRequirement } from "./actions";

const companySchema = z.object({ id: z.string().uuid(), name: z.string() });
const requirementSchema = z.array(z.object({
  id: z.string().uuid(),
  name: z.string(),
  renewal_months: z.number().int(),
}));

export default async function RequirementsPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ error?: string }>;
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
  const requirements = (await loadSupplierPages(async (after) => {
    let request = client.from("document_requirements").select("id, name, renewal_months")
      .eq("company_id", company.id).order("id").limit(200);
    if (after) request = request.gt("id", after);
    const { data, error } = await request;
    if (error) {
      console.error("Requirement list failed", { code: error.code });
      throw new Error("Unable to load document requirements");
    }
    return requirementSchema.parse(data);
  })).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const search = await searchParams;

  return (
    <WorkspaceShell companyName={company.name} companyId={company.id} role={role} currentSection="requirements">
      <div className="workspace-heading">
        <div>
          <p className="eyebrow">DOCUMENT MANAGEMENT</p>
          <h1>Document requirements</h1>
          <p>Define the documents your company requires from its suppliers.</p>
        </div>
        <Link className="back-link" href={`/workspace/${company.id}`}>Suppliers <Icon name="arrowUpRight" /></Link>
      </div>
      {search.error && <p role="alert" className="form-alert workspace-alert"><Icon name="warning" /> The requirement could not be created. Check its values and your permissions.</p>}
      {can(role, "manage_requirements") && (
        <section className="directory-card requirement-create" aria-labelledby="create-requirement-title">
          <h2 id="create-requirement-title">Add a requirement</h2>
          <p>Set a name and a renewal period in months.</p>
          <form action={addRequirement} className="requirement-form">
            <input type="hidden" name="companyId" value={company.id} />
            <label className="field">
              <span>Document name</span>
              <input name="name" placeholder="e.g. ISO 9001 certificate" required maxLength={200} />
            </label>
            <label className="field">
              <span>Renewal period (months)</span>
              <input name="renewalMonths" type="number" min={1} max={120} step={1} required />
            </label>
            <button className="button button-dark button-small" type="submit"><Icon name="plus" /> Add requirement</button>
          </form>
        </section>
      )}
      <section className="directory-card" aria-labelledby="requirement-list-title">
        <div className="directory-heading">
          <h2 id="requirement-list-title">Requirements <span className="count-pill">{requirements.length}</span></h2>
          <p>Requirements are private to this workspace.</p>
        </div>
        {requirements.length === 0 ? (
          <div className="empty-state"><span className="empty-icon"><Icon name="file" /></span><h3>No requirements yet</h3><p>{can(role, "manage_requirements") ? "Add your first requirement above." : "No requirements have been added to this workspace."}</p></div>
        ) : (
          <ul className="supplier-list">
            {requirements.map((requirement) => (
              <li className="supplier-row" key={requirement.id}>
                <div className="supplier-identity">
                  <span className="supplier-avatar"><Icon name="file" /></span>
                  <div><strong>{requirement.name}</strong><span>Renews every {requirement.renewal_months} {requirement.renewal_months === 1 ? "month" : "months"}</span></div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="feature-notice">File uploads and reviews are not available yet.</p>
    </WorkspaceShell>
  );
}
