import Link from "next/link";

export function Brand({ light = false }: { light?: boolean }) {
  return (
    <Link href="/" className={`brand${light ? " brand-light" : ""}`} aria-label="SupplierDesk home">
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 36 36" fill="none">
          <path d="M18 3 32 11v14L18 33 4 25V11L18 3Z" fill="#168FF0" />
          <path d="M18 17.2 32 11v14L18 33V17.2Z" fill="#0B3D91" />
          <path d="m4 11 14 6.2V33L4 25V11Z" fill="#2563EB" />
          <path d="m4 11 14 6.2L32 11M18 17.2V33" stroke="white" strokeWidth="1.2" strokeLinejoin="round" />
        </svg>
      </span>
      <span>Supplier<span className="brand-accent">Desk</span></span>
    </Link>
  );
}
