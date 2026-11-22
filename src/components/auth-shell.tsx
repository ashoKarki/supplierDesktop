import type { ReactNode } from "react";
import { Brand } from "./brand";
import { Icon } from "./icons";

export function AuthShell({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="auth-page">
      <header className="auth-header">
        <Brand />
        <span className="environment-badge"><span /> Early development</span>
      </header>
      <main className="auth-layout">
        <aside className="auth-aside">
          <div className="aside-topline"><span className="aside-dot" /> THE SUPPLIER WORKSPACE</div>
          <div className="aside-copy">
            <p className="aside-kicker">A clearer way to work</p>
            <h2>Better visibility.<br /><span>Stronger supplier relationships.</span></h2>
            <p>Bring your supplier information together in one dedicated workspace for your company.</p>
          </div>
          <div className="aside-illustration" aria-hidden="true">
            <div className="illustration-orbit orbit-one" />
            <div className="illustration-orbit orbit-two" />
            <div className="illustration-card">
              <span className="illustration-icon"><Icon name="building" /></span>
              <span><strong>Your workspace</strong><small>One place for your team</small></span>
              <Icon name="check" className="illustration-check" />
            </div>
            <span className="illustration-node node-one"><Icon name="file" /></span>
            <span className="illustration-node node-two"><Icon name="users" /></span>
            <span className="illustration-node node-three"><Icon name="lock" /></span>
          </div>
          <div className="aside-footer"><Icon name="lock" /> Built for company workspaces</div>
        </aside>
        <section className="auth-content" aria-labelledby="auth-title">
          <div className="auth-content-inner">
            <p className="eyebrow">{eyebrow}</p>
            <h1 id="auth-title">{title}</h1>
            <p className="auth-description">{description}</p>
            {children}
          </div>
        </section>
      </main>
      <footer className="auth-page-footer"><span>© SupplierDesk</span><span>Not yet ready for production use</span></footer>
    </div>
  );
}
