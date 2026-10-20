"use client";

import { useActionState, useRef, useState } from "react";
import { createUser, updateUser, type ClientResult } from "@/app/actions";
import { submitWith } from "@/components/client-forms";
import { RequiredNote } from "@/components/required-note";
import type { Permissions } from "@/lib/owner";

type User = { id: string; full_name: string; email: string; permissions: Permissions };

function Message({ state, saved }: { state: ClientResult; saved: string }) {
  if (!state) return null;
  if ("error" in state) return <p className="text-sm text-red-600 sm:col-span-2">Couldn&apos;t save: {state.error}</p>;
  return <p className="text-sm text-green-700 sm:col-span-2">{saved}</p>;
}

function Fields({ prefix, user, newUser }: { prefix: string; user?: User; newUser?: boolean }) {
  return (
    <>
      <RequiredNote className="sm:col-span-2" />
      <div>
        <label className="label" htmlFor={`${prefix}-name`}>Name</label>
        <input className="input" id={`${prefix}-name`} name="full_name" defaultValue={user?.full_name ?? ""} required />
      </div>
      <div>
        <label className="label" htmlFor={`${prefix}-email`}>Email (used to sign in)</label>
        <input className="input" id={`${prefix}-email`} name="email" type="email" autoComplete="off" defaultValue={user?.email ?? ""} required />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor={`${prefix}-password`}>{newUser ? "Password" : "New password"}</label>
        <input
          className="input"
          id={`${prefix}-password`}
          name="password"
          type="text"
          autoComplete="new-password"
          minLength={8}
          required={newUser}
          placeholder={newUser ? "At least 8 characters" : "Leave blank to keep the current password"}
        />
      </div>
      <fieldset className="space-y-2 sm:col-span-2">
        <legend className="label">This person can</legend>
        <Check name="can_create_jobs" checked={user?.permissions.createJobs ?? true} label="Create service tickets and service calls" />
        <Check name="can_use_timers" checked={user?.permissions.timers ?? true} label="Run timers and add or remove time" />
        <Check name="can_manage_settings" checked={user?.permissions.settings ?? true} label="Open Settings and manage users" />
        <p className="text-xs text-slate-500">Everyone can see and edit jobs and clients. Only David sees Reports.</p>
      </fieldset>
    </>
  );
}

function Check({ name, checked, label }: { name: string; checked: boolean; label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" name={name} defaultChecked={checked} className="h-4 w-4 accent-brand" />
      {label}
    </label>
  );
}

/** "+ Add user" panel that clears and closes itself after saving. */
export function AddUserForm() {
  const panel = useRef<HTMLDetailsElement>(null);
  const [formKey, setFormKey] = useState(0);
  const [state, action, pending] = useActionState(async (prev: ClientResult, data: FormData) => {
    const result = await createUser(prev, data);
    if (result && "ok" in result) {
      setFormKey((k) => k + 1);
      if (panel.current) panel.current.open = false;
    }
    return result;
  }, null);
  return (
    <details ref={panel} className="mt-3">
      <summary className="cursor-pointer font-semibold text-brand">+ Add user</summary>
      <form key={formKey} onSubmit={submitWith(action)} className="mt-3 grid gap-3 sm:grid-cols-2">
        <Fields prefix="new-user" newUser />
        {state && "error" in state && <Message state={state} saved="" />}
        <button className="btn sm:col-span-2" disabled={pending}>{pending ? "Adding…" : "Add user"}</button>
      </form>
    </details>
  );
}

export function EditUserForm({ user }: { user: User }) {
  const [formKey, setFormKey] = useState(0);
  const [state, action, pending] = useActionState(async (prev: ClientResult, data: FormData) => {
    const result = await updateUser(user.id, prev, data);
    if (result && "ok" in result) setFormKey((k) => k + 1); // clear the password box
    return result;
  }, null);
  return (
    <form key={formKey} onSubmit={submitWith(action)} className="mt-3 grid gap-3 sm:grid-cols-2">
      <Fields prefix={user.id} user={user} />
      <Message state={state} saved="✓ Saved" />
      <button className="btn sm:col-span-2" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
    </form>
  );
}
