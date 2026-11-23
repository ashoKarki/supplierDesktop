import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import { WorkspaceShell } from "@/components/workspace-shell";
import { can } from "@/lib/security/permissions";
import { requireUser } from "@/lib/supabase/require-user";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supplierRepository } from "@/lib/supabase/suppliers";
import { loadWorkspaceReportPage } from "@/lib/supabase/workspace-reports";
import { reportKinds, reportTableForRows } from "@/services/report-tables";

const rowsPerPage = 50;

function pageNumber(value: string | string[] | undefined) {
  const parsed = z.coerce.number().int().min(1).max(20_000).safeParse(Array.isArray(value) ? undefined : value);
  return parsed.success ? parsed.data : 1;
}

function reportsHref(companyId: string, pages: Record<(typeof reportKinds)[number], number>) {
  const search = new URLSearchParams({
    compliance: String(pages.compliance),
    expiry: String(pages.expiry),
    outstanding: String(pages.outstanding),
  });
  return `/workspace/${companyId}/reports?${search}`;
}

function pageHref(companyId: string, pages: Record<(typeof reportKinds)[number], number>, kind: (typeof reportKinds)[number], page: number) {
  return reportsHref(companyId, { ...pages, [kind]: page });
}

export default async function ReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const parsed = z.string().uuid().safeParse((await params).companyId);
  if (!parsed.success) notFound();
  const query = await searchParams;
  const pages = {
    compliance: pageNumber(query.compliance),
    expiry: pageNumber(query.expiry),
    outstanding: pageNumber(query.outstanding),
  };
  const client = await createSupabaseServerClient();
  const user = await requireUser(client);
  const role = await supplierRepository(client).roleFor(user.id, parsed.data);
  if (!role || !can(role, "view_workspace")) notFound();
  const { data: company, error } = await client.from("companies").select("id, name, time_zone").eq("id", parsed.data).maybeSingle();
  if (error) {
    console.error("Reports workspace lookup failed", { code: error.code });
    throw new Error("Unable to load reports");
  }
  if (!company) notFound();
  const [compliancePage, expiryPage, outstandingPage] = await Promise.all([
    loadWorkspaceReportPage(client, company.id, "compliance", pages.compliance, rowsPerPage),
    loadWorkspaceReportPage(client, company.id, "expiry", pages.expiry, rowsPerPage),
    loadWorkspaceReportPage(client, company.id, "outstanding", pages.outstanding, rowsPerPage),
  ]);
  const pageData = {
    compliance: compliancePage,
    expiry: expiryPage,
    outstanding: outstandingPage,
  };
  const lastPages = {
    compliance: Math.max(1, Math.ceil(compliancePage.total / rowsPerPage)),
    expiry: Math.max(1, Math.ceil(expiryPage.total / rowsPerPage)),
    outstanding: Math.max(1, Math.ceil(outstandingPage.total / rowsPerPage)),
  };
  const validPages = {
    compliance: Math.min(pages.compliance, lastPages.compliance),
    expiry: Math.min(pages.expiry, lastPages.expiry),
    outstanding: Math.min(pages.outstanding, lastPages.outstanding),
  };
  if (validPages.compliance !== pages.compliance
    || validPages.expiry !== pages.expiry
    || validPages.outstanding !== pages.outstanding) {
    redirect(reportsHref(company.id, validPages));
  }
  const tables = {
    compliance: reportTableForRows("compliance", compliancePage.rows),
    expiry: reportTableForRows("expiry", expiryPage.rows),
    outstanding: reportTableForRows("outstanding", outstandingPage.rows),
  };
  return (
    <WorkspaceShell companyName={company.name} companyId={company.id} role={role} currentSection="reports">
      <div className="workspace-heading"><div><p className="eyebrow">WORKSPACE OVERVIEW</p><h1>Reports</h1>
        <p>Current obligations for active suppliers, based on the latest request per requirement.</p></div></div>
      <p className="dashboard-context">
        Dates use {company.time_zone}; deadlines and expiry dates include the whole day.
        Compliance priority: action required, expired, incomplete, pending review, expiring, complete.
        Suppliers without current requirements are not assessed.
      </p>
      {reportKinds.map((kind) => {
        const table = tables[kind];
        const page = pageData[kind];
        const pageCount = Math.max(1, Math.ceil(page.total / rowsPerPage));
        return <section className="directory-card requirement-create report-section" key={kind} aria-labelledby={`${kind}-report`}>
          <div className="directory-heading"><h2 id={`${kind}-report`}>{table.title}</h2>
            {can(role, "export_data") && <div className="report-actions">
              <Link className="button button-outline button-small" href={`/workspace/${company.id}/reports/${kind}`} prefetch={false}>Download CSV</Link>
              <Link className="button button-outline button-small" href={`/workspace/${company.id}/reports/${kind}?format=pdf`} prefetch={false}>Download PDF</Link>
            </div>}
          </div>
          {table.rows.length === 0 ? <p className="dashboard-empty">No records to report.</p> :
            <div className="report-table-scroll"><table>
              <thead><tr>{table.headers.map((header) => <th scope="col" key={header}>{header}</th>)}</tr></thead>
              <tbody>{table.rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) =>
                <td key={cellIndex}>{cell ?? "—"}</td>)}</tr>)}</tbody>
            </table></div>}
          {page.total > 0 && <nav className="report-pagination" aria-label={`${table.title} pages`}>
            <p>Showing {(pages[kind] - 1) * rowsPerPage + 1}-{Math.min(pages[kind] * rowsPerPage, page.total)} of {page.total}</p>
            <div className="report-actions">
                {pages[kind] > 1
                  ? <Link className="button button-outline button-small" href={pageHref(company.id, pages, kind, pages[kind] - 1)}>Previous</Link>
                  : <span className="button button-outline button-small" aria-disabled="true">Previous</span>}
                {pages[kind] < pageCount
                  ? <Link className="button button-outline button-small" href={pageHref(company.id, pages, kind, pages[kind] + 1)}>Next</Link>
                  : <span className="button button-outline button-small" aria-disabled="true">Next</span>}
            </div>
          </nav>}
        </section>;
      })}
    </WorkspaceShell>
  );
}
