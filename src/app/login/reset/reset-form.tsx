"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

const supabase = () => createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

type Stage = "checking" | "ready" | "invalid" | "saving";

export function ResetForm() {
  const [stage, setStage] = useState<Stage>("checking");
  const [error, setError] = useState("");

  // The email link brings the sign-in tokens in the address after "#".
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");
    if (!accessToken || !refreshToken) {
      setError(hash.get("error_description")?.replace(/\+/g, " ") ?? "");
      setStage("invalid");
      return;
    }
    supabase()
      .auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error }) => {
        history.replaceState(null, "", window.location.pathname);
        if (error) {
          setError(error.message);
          setStage("invalid");
        } else setStage("ready");
      });
  }, []);

  if (stage === "checking") return <p className="card text-center text-slate-500">Checking your link…</p>;
  if (stage === "invalid") {
    return (
      <div className="card space-y-4 text-center">
        <p>This reset link has expired or was already used.</p>
        {error && <p className="text-sm text-slate-500">{error}</p>}
        <Link href="/login/forgot" className="btn block w-full">Send a new link</Link>
      </div>
    );
  }

  return (
    <form
      className="card space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const password = String(form.get("password") ?? "");
        if (password.length < 8) return setError("Use at least 8 characters.");
        if (password !== form.get("confirm")) return setError("The two passwords don't match.");
        setError("");
        setStage("saving");
        const { error } = await supabase().auth.updateUser({ password });
        if (error) {
          setError(error.message);
          setStage("ready");
        } else window.location.assign("/dashboard");
      }}
    >
      <div>
        <label className="label" htmlFor="password">New password</label>
        <input className="input" id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      <div>
        <label className="label" htmlFor="confirm">Type it again</label>
        <input className="input" id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button className="btn w-full" disabled={stage === "saving"}>{stage === "saving" ? "Saving…" : "Save new password"}</button>
    </form>
  );
}
