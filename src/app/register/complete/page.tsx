import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { Icon } from "@/components/icons";

export default function CompletePage() {
  return (
    <AuthShell eyebrow="EMAIL VERIFICATION" title="Verification processed" description="Continue to your company workspace.">
      <div className="message-panel">
        <span className="message-icon"><Icon name="check" /></span>
        <h2>Next steps</h2>
        <p>If you followed your verification link, workspace setup was attempted. The rest of SupplierDesk is still under development.</p>
      </div>
      <Link className="button button-dark auth-submit" href="/sign-in">Sign in to retry setup <Icon name="arrowRight" /></Link>
    </AuthShell>
  );
}
