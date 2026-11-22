import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { Icon } from "@/components/icons";

export default function CheckEmailPage() {
  return (
    <AuthShell eyebrow="ONE MORE STEP" title="Check your email" description="Verify your email address to continue setting up your company workspace.">
      <div className="message-panel">
        <span className="message-icon"><Icon name="mail" /></span>
        <h2>Look out for a verification email</h2>
        <p>If the address can be registered, a verification email will be sent. Open its link in this browser.</p>
      </div>
      <div className="auth-bottom"><p>Already verified? <Link href="/sign-in">Sign in</Link></p></div>
    </AuthShell>
  );
}
