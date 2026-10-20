"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn } from "@/app/actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, null);
  return (
    <form action={action} className="card space-y-4">
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input className="input" id="email" name="email" key={state?.email} defaultValue={state?.email} type="email" autoComplete="email" required />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {state && <p className="text-sm text-red-600">{state.error}</p>}
      <button className="btn w-full" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
      <p className="text-center text-sm">
        <Link href="/login/forgot" className="font-semibold text-brand">Forgot password?</Link>
      </p>
    </form>
  );
}
