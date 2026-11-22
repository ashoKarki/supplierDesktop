import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { RegistrationForm } from "./registration-form";

export default function RegisterPage() {
  return (
    <AuthShell
      eyebrow="GET STARTED"
      title="Create your workspace"
      description="Tell us a little about you and your company to get started."
    >
      <RegistrationForm />
      <div className="auth-bottom">
        <p>Already have an account? <Link href="/sign-in">Sign in</Link></p>
        <p>Joining an existing company? Use your company invitation instead.</p>
      </div>
    </AuthShell>
  );
}
