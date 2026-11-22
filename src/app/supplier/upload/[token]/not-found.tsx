import Link from "next/link";

export default function SupplierLinkUnavailable() {
  return (
    <main className="supplier-upload-page">
      <Link className="supplier-upload-brand" href="/">SupplierDesk</Link>
      <section lang="en">
        <h1>Link unavailable</h1>
        <p>This link is unavailable. Please contact the company that requested your documents.</p>
      </section>
      <section lang="de">
        <h2>Link nicht verfügbar</h2>
        <p>Dieser Link ist nicht verfügbar. Bitte kontaktieren Sie das Unternehmen, das Ihre Dokumente angefordert hat.</p>
      </section>
    </main>
  );
}
