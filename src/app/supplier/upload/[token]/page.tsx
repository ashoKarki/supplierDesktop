import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { findSupplierLink } from "@/lib/supabase/supplier-links";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { uploadSupplierDocument } from "./actions";

const errorMessages: Record<string, string> = {
  upload: "Choose a valid PDF, JPEG or PNG of at most 15 MB and a valid expiry date.",
  state: "This document is no longer accepting submissions, or this link has expired.",
  scanner: "Uploads are unavailable because a scanner is not configured.",
  storage: "Document storage is unavailable or the upload could not be completed.",
};

export default async function SupplierUploadPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string; uploaded?: string }>;
}) {
  await connection();
  const { token } = await params;
  const link = await findSupplierLink(token);
  if (!link) notFound();
  const service = createSupabaseServiceClient();
  const [company, request, items] = await Promise.all([
    service.from("companies").select("name").eq("id", link.company_id).maybeSingle(),
    service.from("document_requests").select("supplier_id").eq("company_id", link.company_id)
      .eq("id", link.request_id).maybeSingle(),
    service.from("document_request_items").select("id, status, requirement_id")
      .eq("company_id", link.company_id).eq("request_id", link.request_id).order("id").limit(100),
  ]);
  if (company.error || request.error || items.error) {
    console.error("Supplier request lookup failed", {
      code: company.error?.code ?? request.error?.code ?? items.error?.code,
    });
    throw new Error("Unable to load supplier request");
  }
  if (!company.data || !request.data) notFound();
  const requirementIds = items.data.map((item) => item.requirement_id);
  const [supplier, requirements] = await Promise.all([
    service.from("suppliers").select("name").eq("company_id", link.company_id)
      .eq("id", request.data.supplier_id).maybeSingle(),
    requirementIds.length > 0
      ? service.from("document_requirements").select("id, name").eq("company_id", link.company_id).in("id", requirementIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (supplier.error || requirements.error) {
    console.error("Supplier request details failed", { code: supplier.error?.code ?? requirements.error?.code });
    throw new Error("Unable to load supplier request");
  }
  if (!supplier.data) notFound();
  const names = new Map(requirements.data.map((requirement) => [requirement.id, requirement.name]));
  const rejections = await Promise.all(items.data.filter((item) => item.status === "rejected").map(async (item) => {
    const { data, error } = await service.from("document_review_events").select("reason")
      .eq("company_id", link.company_id).eq("item_id", item.id).eq("status", "rejected")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) {
      console.error("Supplier rejection lookup failed", { code: error.code });
      throw new Error("Unable to load document review");
    }
    return [item.id, data?.reason ?? null] as const;
  }));
  const rejectionReasons = new Map(rejections);
  const search = await searchParams;

  return (
    <main className="supplier-upload-page">
      <Link className="supplier-upload-brand" href="/">SupplierDesk</Link>
      <div className="workspace-heading">
        <p className="eyebrow">SUPPLIER DOCUMENT REQUEST</p>
        <h1>Upload your documents</h1>
        <p>{company.data.name} has requested documents from {supplier.data.name}. No account is required.</p>
        <p>This link expires on {link.expires_at.slice(0, 10)} at {link.expires_at.slice(11, 16)} UTC.</p>
      </div>
      {search.error && <p role="alert" className="form-alert">{errorMessages[search.error] ?? "The upload could not be completed."}</p>}
      {search.uploaded && <p role="status" className="supplier-upload-success">Document submitted for review.</p>}
      <section className="directory-card requirement-create" aria-labelledby="supplier-documents-title">
        <h2 id="supplier-documents-title">Requested documents</h2>
        {items.data.map((item) => (
          <div className="document-item supplier-document-item" key={item.id}>
            <div className="document-item-heading">
              <strong>{names.get(item.requirement_id) ?? "Document requirement"}</strong>
              <span className="document-status">{item.status.replaceAll("_", " ")}</span>
            </div>
            {item.status === "rejected" && rejectionReasons.get(item.id)
              && <p className="document-meta">Reason: {rejectionReasons.get(item.id)}</p>}
            {["requested", "rejected", "approved", "expired"].includes(item.status) ? (
              <form action={uploadSupplierDocument} className="document-action">
                <input type="hidden" name="token" value={token} />
                <input type="hidden" name="itemId" value={item.id} />
                <label className="field"><span>Choose a document</span>
                  <input type="file" name="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" required />
                  <small>PDF, JPEG or PNG; maximum 15 MB.</small>
                </label>
                <label className="field"><span>Expiry date (optional)</span><input type="date" name="expiresOn" /></label>
                <button className="button button-dark button-small" type="submit">Submit document</button>
              </form>
            ) : <p className="document-meta">This document is awaiting review.</p>}
          </div>
        ))}
      </section>
    </main>
  );
}
