"use client";

import Link from "next/link";
import { useActionState } from "react";
import { sendPasswordReset } from "@/app/actions";

export function ForgotForm() {
  const [state, action, pending] = useActionState(sendPasswordReset, null);
  if (state && "sent" in state) {
    return (
      <div className="card space-y-4 text-center">
        <p>If <span className="font-semibold">{state.sent}</span> has an account, we sent it a link to choose a new password.</p>
        <p className="text-sm text-slate-500">Check your inbox, and your spam folder too.</p>
        <Link href="/login" className="btn-light block w-full">Back to sign in</Link>
      </div>
    );
  }
  return (
    <form action={action} className="card space-y-4">
      <p className="text-sm text-slate-600">Enter the email you sign in with and we&apos;ll email you a link to choose a new password.</p>
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input className="input" id="email" name="email" type="email" autoComplete="email" required />
      </div>
      {state && "error" in state && <p className="text-sm text-red-600">{state.error}</p>}
      <button className="btn w-full" disabled={pending}>{pending ? "Sending…" : "Send reset link"}</button>
      <p className="text-center text-sm">
        <Link href="/login" className="font-semibold text-brand">Back to sign in</Link>
      </p>
    </form>
  );
}
