import { notFound } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import { Icon } from "@/components/icons";
import { SupplierLinkForm } from "@/components/supplier-link-form";
import { WorkspaceShell } from "@/components/workspace-shell";
import { can, type Role } from "@/lib/security/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/supabase/require-user";
import { supplierRepository } from "@/lib/supabase/suppliers";
import { loadSupplierPages } from "@/services/supplier-list";
import { addDocumentRequest, reviewDocument, revokeSupplierLink, uploadDocument } from "./actions";

const companySchema = z.object({ id: z.string().uuid(), name: z.string() });
const namedRows = z.array(z.object({ id: z.string().uuid(), name: z.string() }));
const supplierRows = z.array(z.object({ id: z.string().uuid(), name: z.string(), archived_at: z.string().nullable() }));
const requestRows = z.array(z.object({
  id: z.string().uuid(),
  supplier_id: z.string().uuid(),
  created_at: z.string(),
}));
const itemRows = z.array(z.object({
  id: z.string().uuid(),
  request_id: z.string().uuid(),
  requirement_id: z.string().uuid(),
  status: z.string(),
  expires_on: z.string().nullable(),
}));
const versionRows = z.array(z.object({
  id: z.string().uuid(),
  item_id: z.string().uuid(),
  version_number: z.number().int().positive(),
  filename: z.string(),
}));
const eventRows = z.array(z.object({
  id: z.string().uuid(),
  item_id: z.string().uuid(),
  status: z.string(),
  reason: z.string().nullable(),
  created_at: z.string(),
}));
const linkRows = z.array(z.object({
  id: z.string().uuid(),
  request_id: z.string().uuid(),
  expires_at: z.string(),
  revoked_at: z.string().nullable(),
}));

const errorMessages: Record<string, string> = {
  "1": "Check the request details and your permissions.",
  upload: "Choose a valid PDF, JPEG or PNG of at most 15 MB and a valid expiry date.",
  permission: "You do not have permission for this action.",
  state: "This document is not accepting a new version while a review is pending.",
  scanner: "Uploads are disabled because a scanner is not configured. Local no-op scanning is for development only.",
  storage: "Document storage is unavailable or the upload could not be completed.",
  review: "Review could not be completed. Refresh the page and provide a reason when rejecting.",
};

function DocumentItem({
  companyId,
  item,
  name,
  versions,
  events,
  role,
}: {
  companyId: string;
  item: z.infer<typeof itemRows>[number];
  name: string;
  versions: z.infer<typeof versionRows>;
  events: z.infer<typeof eventRows>;
  role: Role;
}) {
  const itemVersions = versions.filter((version) => version.item_id === item.id)
    .sort((a, b) => b.version_number - a.version_number);
  const latest = itemVersions[0];
  const itemEvents = events.filter((event) => event.item_id === item.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const canUpload = can(role, "manage_requests")
    && ["requested", "rejected", "approved", "expired"].includes(item.status);
  return (
    <div className="document-item">
      <div className="document-item-heading">
        <strong>{name}</strong>
        <span className="document-status">{item.status.replaceAll("_", " ")}</span>
      </div>
      {item.expires_on && <p className="document-meta">Expires: {item.expires_on}</p>}
      {itemVersions.length > 0 && (
        <ul className="document-version-list" aria-label={`${name} versions`}>
          {itemVersions.map((version) => (
            <li key={version.id}>
              <a href={`/workspace/${companyId}/documents/${version.id}`}>Version {version.version_number}: {version.filename}</a>
            </li>
          ))}
        </ul>
      )}
      {canUpload && (
        <form action={uploadDocument} className="document-action">
          <input type="hidden" name="companyId" value={companyId} />
          <input type="hidden" name="itemId" value={item.id} />
          <label className="field"><span>Upload document</span>
            <input type="file" name="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" required />
            <small>PDF, JPEG or PNG; maximum 15 MB.</small>
          </label>
          <label className="field"><span>Expiry date (optional)</span><input type="date" name="expiresOn" /></label>
          <button className="button button-outline button-small" type="submit">{latest ? "Upload new version" : "Upload document"}</button>
        </form>
      )}
      {latest && can(role, "review_documents") && item.status === "submitted" && (
        <form action={reviewDocument} className="document-action">
          <input type="hidden" name="companyId" value={companyId} />
          <input type="hidden" name="itemId" value={item.id} />
          <input type="hidden" name="versionId" value={latest.id} />
          <input type="hidden" name="nextStatus" value="under_review" />
          <input type="hidden" name="reason" value="" />
          <input type="hidden" name="expiresOn" value="" />
          <button className="button button-outline button-small" type="submit">Start review</button>
        </form>
      )}
      {latest && can(role, "review_documents") && item.status === "under_review" && (
        <form action={reviewDocument} className="document-action">
          <input type="hidden" name="companyId" value={companyId} />
          <input type="hidden" name="itemId" value={item.id} />
          <input type="hidden" name="versionId" value={latest.id} />
          <label className="field"><span>Review notes (required for rejection)</span><textarea name="reason" maxLength={2000} /></label>
          <label className="field"><span>Expiry date (optional)</span><input type="date" name="expiresOn" defaultValue={item.expires_on ?? ""} /></label>
          <div className="document-buttons">
            <button className="button button-dark button-small" type="submit" name="nextStatus" value="approved">Approve</button>
            <button className="button button-outline button-small" type="submit" name="nextStatus" value="rejected">Reject</button>
          </div>
        </form>
      )}
      {itemEvents.length > 0 && (
        <details className="document-history">
          <summary>Review history</summary>
          <ul>{itemEvents.map((event) => <li key={event.id}>{event.created_at.slice(0, 10)} · {event.status.replaceAll("_", " ")}{event.reason ? `: ${event.reason}` : ""}</li>)}</ul>
        </details>
      )}
    </div>
  );
}

export default async function RequestsPage({
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

  const [suppliers, requirements, requests, items, versions, events, links] = await Promise.all([
    loadSupplierPages(async (after) => {
      let query = client.from("suppliers").select("id, name, archived_at").eq("company_id", company.id).order("id").limit(200);
      if (after) query = query.gt("id", after);
      const { data, error } = await query;
      if (error) {
        console.error("Supplier list failed", { code: error.code });
        throw new Error("Unable to load suppliers");
      }
      return supplierRows.parse(data);
    }),
    loadSupplierPages(async (after) => {
      let query = client.from("document_requirements").select("id, name").eq("company_id", company.id).order("id").limit(200);
      if (after) query = query.gt("id", after);
      const { data, error } = await query;
      if (error) {
        console.error("Requirement list failed", { code: error.code });
        throw new Error("Unable to load requirements");
      }
      return namedRows.parse(data);
    }),
    loadSupplierPages(async (after) => {
      let query = client.from("document_requests").select("id, supplier_id, created_at").eq("company_id", company.id).order("id").limit(200);
      if (after) query = query.gt("id", after);
      const { data, error } = await query;
      if (error) {
        console.error("Request list failed", { code: error.code });
        throw new Error("Unable to load document requests");
      }
      return requestRows.parse(data);
    }),
    loadSupplierPages(async (after) => {
      let query = client.from("document_request_items").select("id, request_id, requirement_id, status, expires_on").eq("company_id", company.id).order("id").limit(200);
      if (after) query = query.gt("id", after);
      const { data, error } = await query;
      if (error) {
        console.error("Request items failed", { code: error.code });
        throw new Error("Unable to load request items");
      }
      return itemRows.parse(data);
    }),
    loadSupplierPages(async (after) => {
      let query = client.from("document_versions").select("id, item_id, version_number, filename").eq("company_id", company.id).order("id").limit(200);
      if (after) query = query.gt("id", after);
      const { data, error } = await query;
      if (error) {
        console.error("Document versions failed", { code: error.code });
        throw new Error("Unable to load document versions");
      }
      return versionRows.parse(data);
    }),
    loadSupplierPages(async (after) => {
      let query = client.from("document_review_events").select("id, item_id, status, reason, created_at").eq("company_id", company.id).order("id").limit(200);
      if (after) query = query.gt("id", after);
      const { data, error } = await query;
      if (error) {
        console.error("Document review history failed", { code: error.code });
        throw new Error("Unable to load review history");
      }
      return eventRows.parse(data);
    }),
    can(role, "manage_requests") ? loadSupplierPages(async (after) => {
      let query = client.from("supplier_upload_links").select("id, request_id, expires_at, revoked_at").eq("company_id", company.id).order("id").limit(200);
      if (after) query = query.gt("id", after);
      const { data, error } = await query;
      if (error) {
        console.error("Supplier links failed", { code: error.code });
        throw new Error("Unable to load supplier links");
      }
      return linkRows.parse(data);
    }) : Promise.resolve([]),
  ]);
  const activeSuppliers = suppliers.filter((supplier) => supplier.archived_at === null);
  const supplierNames = new Map(suppliers.map((supplier) => [supplier.id, supplier.name]));
  const requirementNames = new Map(requirements.map((requirement) => [requirement.id, requirement.name]));
  const search = await searchParams;

  return (
    <WorkspaceShell companyName={company.name} companyId={company.id} role={role} currentSection="requests">
      <div className="workspace-heading"><div><p className="eyebrow">DOCUMENT MANAGEMENT</p><h1>Document requests</h1><p>Create a request for a supplier and select its requirements.</p></div></div>
      {search.error && <p role="alert" className="form-alert workspace-alert"><Icon name="warning" /> {errorMessages[search.error] ?? "The action could not be completed."}</p>}
      {can(role, "manage_requests") && (
        <section className="directory-card requirement-create" aria-labelledby="create-request-title">
          <h2 id="create-request-title">Create a request</h2>
          {activeSuppliers.length === 0 || requirements.length === 0 ? (
            <p>Add an active supplier and a document requirement before creating a request.</p>
          ) : (
            <form action={addDocumentRequest} className="auth-form">
              <input type="hidden" name="companyId" value={company.id} />
              <label className="field">
                <span>Supplier</span>
                <select className="request-select" name="supplierId" required defaultValue="">
                  <option value="" disabled>Choose a supplier</option>
                  {activeSuppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                </select>
              </label>
              <fieldset className="request-requirements">
                <legend>Document requirements</legend>
                {requirements.map((requirement) => (
                  <label key={requirement.id}><input type="checkbox" name="requirementIds" value={requirement.id} /> {requirement.name}</label>
                ))}
              </fieldset>
              <button className="button button-dark button-small" type="submit"><Icon name="plus" /> Create request</button>
            </form>
          )}
        </section>
      )}
      <section className="directory-card" aria-labelledby="requests-title">
        <div className="directory-heading"><h2 id="requests-title">Requests <span className="count-pill">{requests.length}</span></h2><p>Requests in this company workspace.</p></div>
        {requests.length === 0 ? <div className="empty-state"><span className="empty-icon"><Icon name="file" /></span><h3>No requests yet</h3></div> : (
          <ul className="supplier-list">
            {requests.map((request) => (
              <li className="document-request-row" key={request.id}>
                <div className="supplier-identity"><span className="supplier-avatar"><Icon name="file" /></span><div>
                  <strong>{supplierNames.get(request.supplier_id) ?? "Supplier unavailable"}</strong>
                </div></div>
                {items.filter((item) => item.request_id === request.id).map((item) => (
                  <DocumentItem key={item.id} companyId={company.id} item={item}
                    name={requirementNames.get(item.requirement_id) ?? "Requirement unavailable"}
                    versions={versions} events={events} role={role} />
                ))}
                {can(role, "manage_requests") && <div className="supplier-links">
                  <SupplierLinkForm companyId={company.id} requestId={request.id} />
                  {links.filter((link) => link.request_id === request.id).map((link) => (
                    <div className="supplier-link-row" key={link.id}>
                      <span>{link.revoked_at ? "Revoked" : "Expires"}: {(link.revoked_at ?? link.expires_at).slice(0, 10)} {(link.revoked_at ?? link.expires_at).slice(11, 16)} UTC</span>
                      {!link.revoked_at && new Date(link.expires_at).getTime() > Date.now() && (
                        <form action={revokeSupplierLink}>
                          <input type="hidden" name="companyId" value={company.id} />
                          <input type="hidden" name="linkId" value={link.id} />
                          <button className="button button-outline button-small" type="submit">Revoke</button>
                        </form>
                      )}
                    </div>
                  ))}
                </div>}
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="feature-notice">Uploads require local development scanner configuration. Supplier links expire after 7 days.</p>
    </WorkspaceShell>
  );
}
