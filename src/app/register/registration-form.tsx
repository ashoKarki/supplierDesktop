"use client";

import { useActionState } from "react";
import { Icon } from "@/components/icons";
import { register } from "./actions";

export function RegistrationForm() {
  const [state, action, pending] = useActionState(register, null);
  return (
    <form action={action} className="auth-form">
      <div className="form-section-heading"><span>01</span><div><h2>Your account</h2><p>You&apos;ll be the owner of this workspace.</p></div></div>
      <div className="form-grid">
        <label className="field">
          <span>Full name <span className="required">*</span></span>
          <input name="administratorName" autoComplete="name" placeholder="e.g. Alex Morgan" required maxLength={200} />
        </label>
        <label className="field">
          <span>Business email <span className="required">*</span></span>
          <input name="email" type="email" autoComplete="email" placeholder="you@company.com" required maxLength={254} />
        </label>
        <label className="field field-full">
          <span>Password <span className="required">*</span></span>
          <input name="password" type="password" autoComplete="new-password" placeholder="Create a password" required minLength={12} maxLength={128} aria-describedby="password-hint" />
          <small id="password-hint">Use at least 12 characters.</small>
        </label>
      </div>
      <div className="form-section-heading form-section-spaced"><span>02</span><div><h2>Company details</h2><p>Set up your company&apos;s workspace.</p></div></div>
      <div className="form-grid company-grid">
        <label className="field">
          <span>Company name <span className="required">*</span></span>
          <input name="companyName" autoComplete="organization" placeholder="Your company name" required maxLength={200} />
        </label>
        <label className="field">
          <span>Country code <span className="required">*</span></span>
          <input name="country" placeholder="e.g. AT" required pattern="[A-Z]{2}" maxLength={2} aria-describedby="country-hint" />
          <small id="country-hint">Two uppercase letters, e.g. AT or DE.</small>
        </label>
        <label className="field field-full">
          <span>Business details <span className="required">*</span></span>
          <textarea name="businessDetails" placeholder="Briefly describe your business" rows={3} required maxLength={2000} />
        </label>
      </div>
      {state && !state.ok && (
        <p role="alert" className="form-alert">
          <Icon name="warning" />
          {state.reason === "invalid"
            ? "Check the form fields and try again."
            : "Registration is currently unavailable. Please try again later."}
        </p>
      )}
      <button className="button button-dark auth-submit" disabled={pending}>
        {pending ? "Creating account…" : "Create company account"} <Icon name="arrowRight" />
      </button>
      <p className="form-footnote"><Icon name="lock" /> You&apos;ll be asked to verify your email address.</p>
    </form>
  );
}
