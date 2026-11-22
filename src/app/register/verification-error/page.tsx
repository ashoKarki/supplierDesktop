import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { Icon } from "@/components/icons";

export default function VerificationErrorPage() {
  return (
    <AuthShell eyebrow="EMAIL VERIFICATION" title="We couldn’t verify your account" description="Verification or workspace setup could not be completed.">
      <div className="message-panel">
        <span className="message-icon message-icon-warning"><Icon name="warning" /></span>
        <h2>Try signing in again</h2>
        <p>The link may have expired, or workspace setup may be unavailable. If your email is verified, sign in to retry setup.</p>
      </div>
      <Link className="button button-dark auth-submit" href="/sign-in">Company owner sign-in <Icon name="arrowRight" /></Link>
    </AuthShell>
  );
}
