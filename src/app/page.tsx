import Link from "next/link";
import { Brand } from "@/components/brand";
import { Icon } from "@/components/icons";

export default function Home() {
  return (
    <div className="landing-page">
      <header className="landing-header">
        <Brand />
        <nav className="landing-nav" aria-label="Account navigation">
          <Link className="text-link" href="/sign-in">Sign in</Link>
          <Link className="button button-dark button-small" href="/register">Create account <Icon name="arrowRight" /></Link>
        </nav>
      </header>
      <main className="landing-main">
        <div className="landing-copy">
          <div className="landing-tag"><span /> A WORKSPACE FOR MANUFACTURERS</div>
          <h1>Better supplier<br /><span>work starts here.</span></h1>
          <p>Bring your suppliers and your team together in a workspace built for the way manufacturers work.</p>
          <div className="landing-actions">
            <Link className="button button-dark" href="/register">Create a company account <Icon name="arrowRight" /></Link>
            <Link className="button button-outline" href="/sign-in">Sign in</Link>
          </div>
          <div className="landing-notice"><Icon name="warning" /> SupplierDesk is in early development and is not ready for production use.</div>
        </div>
        <div className="landing-visual" aria-hidden="true">
          <div className="visual-top"><div className="visual-logo"><Icon name="grid" /></div><span>YOUR WORKSPACE</span><span className="visual-dots">•••</span></div>
          <div className="visual-body">
            <div className="visual-eyebrow">SUPPLIERDESK</div>
            <h2>Everything in its place.</h2>
            <p>A more organized starting point for your supplier work.</p>
            <div className="visual-row"><span className="visual-row-icon sage"><Icon name="building" /></span><span><strong>Company workspace</strong><small>A dedicated home for your team</small></span><Icon name="arrowUpRight" /></div>
            <div className="visual-row"><span className="visual-row-icon blue"><Icon name="users" /></span><span><strong>Supplier directory</strong><small>Keep your supplier information together</small></span><Icon name="arrowUpRight" /></div>
            <div className="visual-note"><Icon name="file" /> Built for simpler supplier management</div>
          </div>
          <div className="visual-caption">ILLUSTRATIVE WORKSPACE PREVIEW</div>
        </div>
      </main>
      <footer className="landing-footer"><span>© SupplierDesk</span><span>Made for better supplier work.</span></footer>
    </div>
  );
}
