import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { SignInForm } from "./sign-in-form";

export default function SignInPage() {
  return (
    <AuthShell
      eyebrow="WELCOME BACK"
      title="Sign in to SupplierDesk"
      description="Access your company workspace and pick up where you left off."
    >
      <SignInForm />
      <div className="auth-bottom">
        <p>New to SupplierDesk? <Link href="/register">Create a company account</Link></p>
        <p>Verify your email before signing in. Employee sign-in is not yet available.</p>
      </div>
    </AuthShell>
  );
}
