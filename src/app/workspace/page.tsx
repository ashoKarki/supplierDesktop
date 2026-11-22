import Link from "next/link";
import { connection } from "next/server";
import { z } from "zod";
import { Icon } from "@/components/icons";
import { WorkspaceShell } from "@/components/workspace-shell";
import { requireUser } from "@/lib/supabase/require-user";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const companiesSchema = z.array(z.object({ id: z.string().uuid(), name: z.string() }));

export default async function WorkspaceList() {
  await connection();
  const client = await createSupabaseServerClient();
  await requireUser(client);

  const { data, error } = await client.from("companies").select("id, name").order("name");
  if (error) {
    console.error("Workspace list failed", { code: error.code });
    throw new Error("Unable to load workspaces");
  }
  const companies = companiesSchema.parse(data);
  return (
    <WorkspaceShell>
      <div className="workspace-heading">
        <div>
          <p className="eyebrow">YOUR ACCOUNT</p>
          <h1>Your workspaces</h1>
          <p>Choose a company to continue to its supplier workspace.</p>
        </div>
      </div>
      <div className="section-title"><h2>Company workspaces</h2><span className="count-pill">{companies.length}</span></div>
      {companies.length === 0 && (
        <div className="empty-state"><span className="empty-icon"><Icon name="building" /></span><h3>No workspaces yet</h3><p>No company workspaces are available for this account.</p></div>
      )}
      <ul className="company-list">
        {companies.map((company) => (
          <li key={company.id}>
            <Link className="company-card" href={`/workspace/${company.id}`}>
              <span className="company-card-icon"><Icon name="building" /></span>
              <span className="company-card-copy"><strong>{company.name}</strong><small>Company workspace</small></span>
              <span className="company-card-action">Open workspace <Icon name="arrowRight" /></span>
            </Link>
          </li>
        ))}
      </ul>
    </WorkspaceShell>
  );
}
