"use client";

import { useActionState } from "react";
import { createSupplierLink, emailSupplierLink, type SupplierInvitationState, type SupplierLinkState } from "@/app/workspace/[companyId]/requests/actions";

const initialState: SupplierLinkState = {};
const invitationInitialState: SupplierInvitationState = {};

export function SupplierLinkForm({ companyId, requestId }: { companyId: string; requestId: string }) {
  const [state, action, pending] = useActionState(createSupplierLink, initialState);
  const [invitation, sendInvitation, sending] = useActionState(emailSupplierLink, invitationInitialState);
  return (
    <div className="supplier-link-create">
      <form action={action}>
        <input type="hidden" name="companyId" value={companyId} />
        <input type="hidden" name="requestId" value={requestId} />
        <button className="button button-outline button-small" disabled={pending} type="submit">
          {pending ? "Creating link..." : "Create supplier link"}
        </button>
      </form>
      {state.error && <p role="alert" className="form-alert">{state.error}</p>}
      {state.url && <label className="field"><span>Copy and securely share this link. It is shown only once and expires in 7 days.</span>
        <textarea readOnly value={state.url} rows={2} />
      </label>}
      <form action={sendInvitation} className="document-action">
        <input type="hidden" name="companyId" value={companyId} />
        <input type="hidden" name="requestId" value={requestId} />
        <label className="field"><span>Supplier email</span><input name="email" type="email" required maxLength={254} /></label>
        <label className="field"><span>Invitation language</span>
          <select name="language" defaultValue="en"><option value="en">English</option><option value="de">Deutsch</option></select>
        </label>
        <button className="button button-outline button-small" disabled={sending} type="submit">
          {sending ? "Sending invitation..." : "Email supplier invitation"}
        </button>
      </form>
      {invitation.error && <p role="alert" className="form-alert">{invitation.error}</p>}
      {invitation.sent && <p role="status" className="supplier-upload-success">Invitation accepted for delivery.</p>}
    </div>
  );
}
