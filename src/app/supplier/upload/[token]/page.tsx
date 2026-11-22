import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { createTranslator } from "next-intl";
import { z } from "zod";
import { portalLocale, portalMessages } from "@/i18n/supplier-portal";
import { findSupplierLink } from "@/lib/supabase/supplier-links";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { uploadSupplierDocument } from "./actions";

const errors = z.enum(["upload", "state", "scanner", "storage"]);
const statuses = z.enum(["requested", "submitted", "under_review", "approved", "rejected", "expired", "cancelled"]);

export default async function SupplierUploadPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string; uploaded?: string; lang?: string }>;
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
  const locale = portalLocale(search.lang);
  const t = createTranslator({ locale, messages: portalMessages[locale] });
  const error = errors.safeParse(search.error);
  const expiry = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeStyle: "short", timeZone: "UTC" })
    .format(new Date(link.expires_at));

  return (
    <main className="supplier-upload-page" lang={locale}>
      <Link className="supplier-upload-brand" href="/">SupplierDesk</Link>
      <nav aria-label="Language / Sprache">
        <Link href={`/supplier/upload/${token}?lang=en`} prefetch={false} aria-current={locale === "en" ? "page" : undefined} lang="en">English</Link>
        {" · "}
        <Link href={`/supplier/upload/${token}?lang=de`} prefetch={false} aria-current={locale === "de" ? "page" : undefined} lang="de">Deutsch</Link>
      </nav>
      <div className="workspace-heading">
        <p className="eyebrow">{t("eyebrow")}</p>
        <h1>{t("title")}</h1>
        <p>{t("introduction", { company: company.data.name, supplier: supplier.data.name })}</p>
        <p>{t("expires", { date: expiry })}</p>
      </div>
      {search.error && <p role="alert" className="form-alert">{t(`errors.${error.success ? error.data : "other"}`)}</p>}
      {search.uploaded && <p role="status" className="supplier-upload-success">{t("uploaded")}</p>}
      <section className="directory-card requirement-create" aria-labelledby="supplier-documents-title">
        <h2 id="supplier-documents-title">{t("requestedDocuments")}</h2>
        {items.data.map((item) => (
          <div className="document-item supplier-document-item" key={item.id}>
            <div className="document-item-heading">
              <strong>{names.get(item.requirement_id) ?? t("documentRequirement")}</strong>
              <span className="document-status">{t(`status.${statuses.parse(item.status)}`)}</span>
            </div>
            {item.status === "rejected" && rejectionReasons.get(item.id)
              && <p className="document-meta">{t("reason", { reason: rejectionReasons.get(item.id) ?? "" })}</p>}
            {["requested", "rejected", "approved", "expired"].includes(item.status) ? (
              <form action={uploadSupplierDocument} className="document-action">
                <input type="hidden" name="token" value={token} />
                <input type="hidden" name="itemId" value={item.id} />
                <input type="hidden" name="lang" value={locale} />
                <label className="field"><span>{t("chooseDocument")}</span>
                  <input type="file" name="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" required />
                  <small>{t("fileHelp")}</small>
                </label>
                <label className="field"><span>{t("expiryDate")}</span><input type="date" name="expiresOn" /></label>
                <button className="button button-dark button-small" type="submit">{t("submitDocument")}</button>
              </form>
            ) : <p className="document-meta">{t("awaitingReview")}</p>}
          </div>
        ))}
      </section>
    </main>
  );
}
