import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import { WorkspaceShell } from "@/components/workspace-shell";
import { buildDashboard } from "@/domain/dashboard";
import { can } from "@/lib/security/permissions";
import { requireUser } from "@/lib/supabase/require-user";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supplierRepository } from "@/lib/supabase/suppliers";
import { loadWorkspaceDocuments } from "@/lib/supabase/workspace-documents";

const companySchema = z.object({ id: z.string().uuid(), name: z.string(), time_zone: z.string().min(1) });

export default async function Dashboard({ params }: { params: Promise<{ companyId: string }> }) {
  await connection();
  const companyId = z.string().uuid().safeParse((await params).companyId);
  if (!companyId.success) notFound();
  const client = await createSupabaseServerClient();
  const user = await requireUser(client);
  const role = await supplierRepository(client).roleFor(user.id, companyId.data);
  if (!role || !can(role, "view_workspace")) notFound();

  const { data: companyData, error: companyError } = await client.from("companies")
    .select("id, name, time_zone").eq("id", companyId.data).maybeSingle();
  if (companyError) {
    console.error("Dashboard workspace lookup failed", { code: companyError.code });
    throw new Error("Unable to load dashboard");
  }
  if (!companyData) notFound();
  const company = companySchema.parse(companyData);
  const documents = await loadWorkspaceDocuments(client, company.id);
  const dashboard = buildDashboard({ ...documents, now: new Date(), timeZone: company.time_zone });
  const metrics = [
    { label: "Total suppliers", value: dashboard.totalSuppliers },
    { label: "Active suppliers", value: dashboard.activeSuppliers },
    { label: "Missing documents", value: dashboard.missing },
    { label: "Overdue requests", value: dashboard.overdueRequests },
    { label: "Pending reviews", value: dashboard.pending },
    { label: "Rejected submissions", value: dashboard.rejected },
    { label: "Expiring within 7 days", value: dashboard.expiryCounts.within7 },
    { label: "Expiring within 30 days", value: dashboard.expiryCounts.within30 },
    { label: "Expiring within 60 days", value: dashboard.expiryCounts.within60 },
    { label: "Expiring within 90 days", value: dashboard.expiryCounts.within90 },
    { label: "Expired documents", value: dashboard.expired },
  ];

  return (
    <WorkspaceShell companyName={company.name} companyId={company.id} role={role} currentSection="dashboard">
      <div className="workspace-heading">
        <div><p className="eyebrow">WORKSPACE OVERVIEW</p><h1>Dashboard</h1>
          <p>Current supplier document activity for {company.name}.</p></div>
        {can(role, "manage_requests") && <Link className="button button-dark" href={`/workspace/${company.id}/requests`}>Request documents</Link>}
      </div>
      <p className="dashboard-context">
        Document counts use the latest request for each requirement and active supplier.
        A cancelled latest request is excluded. Total suppliers includes archived suppliers.
        Expiry and deadline dates use {company.time_zone}; dates remain valid through the end of that day.
        A request is overdue after its deadline if a current document is requested or rejected.
      </p>
      <div className="summary-grid dashboard-grid" aria-label="Workspace overview">
        {metrics.map((metric) => <div className="summary-card" key={metric.label}>
          <div><span>{metric.label}</span><strong>{metric.value}</strong></div>
        </div>)}
      </div>
      <section className="directory-card requirement-create" aria-labelledby="upcoming-expiry-title">
        <div className="directory-heading">
          <div><h2 id="upcoming-expiry-title">Upcoming document expiry</h2><p>Approved documents expiring within 90 days.</p></div>
          <Link className="back-link" href={`/workspace/${company.id}/requests`}>View document requests</Link>
        </div>
        {dashboard.expiring.length === 0
          ? <p className="dashboard-empty">No approved documents are expiring in the next 90 days.</p>
          : <ul className="dashboard-expiry-list">
            {dashboard.expiring.slice(0, 10).map((item) => <li key={item.itemId}>
              <span><strong>{item.requirement}</strong><br />{item.supplier}</span>
              <span><time dateTime={item.date}>{item.date}</time>{" "}
                <Link href={`/workspace/${company.id}/requests#request-${item.requestId}`}>View request</Link>
              </span>
            </li>)}
          </ul>}
        {dashboard.expiring.length > 10 && <p className="dashboard-empty">Showing the first 10 expiring documents.</p>}
      </section>
    </WorkspaceShell>
  );
}
