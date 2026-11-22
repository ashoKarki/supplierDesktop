"use client";

import { useActionState } from "react";
import { Icon } from "@/components/icons";
import { signIn } from "./actions";

export function SignInForm() {
  const [state, action, pending] = useActionState(signIn, null);
  return (
    <form action={action} className="auth-form sign-in-form">
      <label className="field">
        <span>Business email</span>
        <input name="email" type="email" autoComplete="email" placeholder="you@company.com" required maxLength={254} />
      </label>
      <label className="field">
        <span>Password</span>
        <input name="password" type="password" autoComplete="current-password" placeholder="Enter your password" required maxLength={128} />
      </label>
      {state && !state.ok && <p role="alert" className="form-alert"><Icon name="warning" /> Sign-in or workspace setup failed. Check your details and try again.</p>}
      <button className="button button-dark auth-submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"} <Icon name="arrowRight" />
      </button>
    </form>
  );
}
