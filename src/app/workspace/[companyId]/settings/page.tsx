import { notFound } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import { Icon } from "@/components/icons";
import { WorkspaceShell } from "@/components/workspace-shell";
import { can } from "@/lib/security/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/require-user";
import { supplierRepository } from "@/lib/supabase/suppliers";
import { saveCompanyProfile } from "./actions";

export default async function CompanySettings({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  await connection();
  const companyId = z.string().uuid().safeParse((await params).companyId);
  if (!companyId.success) notFound();
  const client = await createSupabaseServerClient();
  const user = await requireUser(client);
  const role = await supplierRepository(client).roleFor(user.id, companyId.data);
  if (!role || !can(role, "view_workspace")) notFound();
  const { data: company, error } = await client.from("companies").select("id, name, country, business_details")
    .eq("id", companyId.data).maybeSingle();
  if (error) {
    console.error("Company profile lookup failed", { code: error.code });
    throw new Error("Unable to load company profile");
  }
  if (!company) notFound();
  const search = await searchParams;
  const editable = can(role, "manage_company");
  let trial: { ends_at: string } | null = null;
  if (editable) {
    const result = await client.from("company_trials").select("ends_at").eq("company_id", company.id).single();
    if (result.error) {
      console.error("Company trial lookup failed", { code: result.error.code });
      throw new Error("Unable to load company trial");
    }
    trial = result.data;
  }

  return (
    <WorkspaceShell companyName={company.name} companyId={company.id} role={role} currentSection="settings">
      <div className="workspace-heading"><div>
        <p className="eyebrow">WORKSPACE SETTINGS</p>
        <h1>Company profile</h1>
        <p>Manage your company&apos;s workspace details.</p>
      </div></div>
      {search.error && <p role="alert" className="form-alert workspace-alert"><Icon name="warning" /> The company profile could not be updated. Check the details and your permissions.</p>}
      {search.saved && <p role="status" className="supplier-upload-success workspace-alert">Company profile saved.</p>}
      <section className="directory-card requirement-create" aria-labelledby="company-profile-title">
        <h2 id="company-profile-title">Company details</h2>
        <p>Only workspace owners and administrators can change these details.</p>
        <form action={saveCompanyProfile} className="company-profile-form">
          <input type="hidden" name="companyId" value={company.id} />
          <label className="field"><span>Company name</span>
            <input name="companyName" defaultValue={company.name} required maxLength={200} disabled={!editable} />
          </label>
          <label className="field"><span>Country code</span>
            <input name="country" defaultValue={company.country} required pattern="[A-Z]{2}" maxLength={2} disabled={!editable} />
            <small>Two-letter uppercase country code.</small>
          </label>
          <label className="field"><span>Business details</span>
            <textarea name="businessDetails" defaultValue={company.business_details} required maxLength={2000} disabled={!editable} />
          </label>
          {editable && <button className="button button-dark button-small" type="submit">Save changes</button>}
        </form>
      </section>
      {trial && <section className="directory-card requirement-create" aria-labelledby="company-trial-title">
        <h2 id="company-trial-title">Company trial</h2>
        <p>Trial ends {new Intl.DateTimeFormat("en", { dateStyle: "long", timeStyle: "short", timeZone: "UTC" }).format(new Date(trial.ends_at))} (UTC). Access continues after the trial while billing is unavailable.</p>
        <p>Planned price: €30 per company per month. Payment processing is not yet available. The plan includes 100 suppliers (including archived suppliers) and 10 members (including owners).</p>
      </section>}
    </WorkspaceShell>
  );
}
