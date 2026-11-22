import type { ReactNode } from "react";
import Link from "next/link";
import { signOut } from "@/app/workspace/sign-out";
import { Brand } from "./brand";
import { Icon } from "./icons";

export function WorkspaceShell({
  companyName,
  companyId,
  role,
  currentSection = "suppliers",
  children,
}: {
  companyName?: string;
  companyId?: string;
  role?: string;
  currentSection?: "suppliers" | "requirements" | "requests";
  children: ReactNode;
}) {
  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <Brand light />
        <div className="sidebar-workspace">
          <span className="sidebar-workspace-icon"><Icon name="building" /></span>
          <span className="sidebar-workspace-copy">
            <small>WORKSPACE</small>
            <strong>{companyName ?? "Your companies"}</strong>
          </span>
        </div>
        <p className="sidebar-label">WORKSPACE</p>
        <nav aria-label="Workspace navigation">
          <Link className={`sidebar-link${companyId ? "" : " active"}`} href="/workspace">
            <Icon name="grid" /> <span>Company workspaces</span>
          </Link>
          {companyId && (
            <Link className={`sidebar-link${currentSection === "suppliers" ? " active" : ""}`} href={`/workspace/${companyId}`} aria-current={currentSection === "suppliers" ? "page" : undefined}>
              <Icon name="users" /> <span>Suppliers</span>
            </Link>
          )}
          {companyId && (
            <Link className={`sidebar-link${currentSection === "requirements" ? " active" : ""}`} href={`/workspace/${companyId}/requirements`} aria-current={currentSection === "requirements" ? "page" : undefined}>
              <Icon name="file" /> <span>Requirements</span>
            </Link>
          )}
          {companyId && (
            <Link className={`sidebar-link${currentSection === "requests" ? " active" : ""}`} href={`/workspace/${companyId}/requests`} aria-current={currentSection === "requests" ? "page" : undefined}>
              <Icon name="file" /> <span>Document requests</span>
            </Link>
          )}
        </nav>
        <p className="sidebar-label">COMING SOON</p>
        <div className="sidebar-upcoming" aria-label="Features in development">
          <span><Icon name="file" /> Documents</span>
          <span><Icon name="users" /> Team members</span>
          <span><Icon name="grid" /> Reports</span>
        </div>
        <div className="sidebar-bottom">
          <span className="sidebar-status"><span /> EARLY DEVELOPMENT</span>
          <p>Workspace features are still being built.</p>
        </div>
      </aside>
      <div className="app-main">
        <header className="app-topbar">
          <div className="topbar-path"><Link href="/workspace">Workspaces</Link>{companyName && <><Icon name="chevronRight" /><span>{companyName}</span></>}</div>
          <div className="topbar-actions">
            {role && <span className="role-pill">{role.replaceAll("_", " ")}</span>}
            <form action={signOut}><button className="signout-button" type="submit"><Icon name="logout" /> <span>Sign out</span></button></form>
          </div>
        </header>
        <main className="workspace-content">{children}</main>
      </div>
    </div>
  );
}
