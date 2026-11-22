"use client";

import { useActionState } from "react";
import { createSupplierLink, type SupplierLinkState } from "@/app/workspace/[companyId]/requests/actions";

const initialState: SupplierLinkState = {};

export function SupplierLinkForm({ companyId, requestId }: { companyId: string; requestId: string }) {
  const [state, action, pending] = useActionState(createSupplierLink, initialState);
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
    </div>
  );
}
