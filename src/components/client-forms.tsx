"use client";

import { startTransition, useActionState, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createClientRecord, deleteClient, updateClient, type ClientResult } from "@/app/actions";

/**
 * Submits without React's automatic form reset, so a failed save keeps what was typed
 * (and the client type and monthly fee boxes stay in step).
 */
function submitWith(action: (data: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => action(data));
  };
}

function Result({ state, saved }: { state: ClientResult; saved: string }) {
  if (!state) return null;
  if ("error" in state) return <p className="text-sm text-red-600 sm:col-span-2">Couldn&apos;t save: {state.error}</p>;
  return <p className="text-sm text-green-700 sm:col-span-2">{saved}</p>;
}

/** "+ Add client" panel that clears and closes itself after saving. */
export function AddClientForm({ children }: { children: ReactNode }) {
  const panel = useRef<HTMLDetailsElement>(null);
  const [formKey, setFormKey] = useState(0);
  const [state, action, pending] = useActionState(async (prev: ClientResult, data: FormData) => {
    const result = await createClientRecord(prev, data);
    if (result && "ok" in result) {
      setFormKey((k) => k + 1); // fresh, empty form for the next client
      if (panel.current) panel.current.open = false;
    }
    return result;
  }, null);
  return (
    <details ref={panel} className="card mb-6">
      <summary className="cursor-pointer font-semibold text-brand">+ Add client</summary>
      <form key={formKey} onSubmit={submitWith(action)} className="mt-3 grid gap-3 sm:grid-cols-2">
        {children}
        {state && "error" in state && <Result state={state} saved="" />}
        <button className="btn sm:col-span-2" disabled={pending}>{pending ? "Adding…" : "Add client"}</button>
      </form>
    </details>
  );
}

export function EditClientForm({ clientId, children }: { clientId: string; children: ReactNode }) {
  const [state, action, pending] = useActionState(updateClient.bind(null, clientId), null);
  return (
    <form onSubmit={submitWith(action)} className="mt-3 grid gap-3 sm:grid-cols-2">
      {children}
      <Result state={state} saved="✓ Saved" />
      <button className="btn sm:col-span-2" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
    </form>
  );
}

export function DeleteClientButton({ clientId, name }: { clientId: string; name: string }) {
  const [state, action, pending] = useActionState(() => deleteClient(clientId), null);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(`Delete ${name}? This can't be undone.`)) e.preventDefault();
      }}
    >
      <button className="btn-danger w-full" disabled={pending}>{pending ? "Deleting…" : "Delete client"}</button>
      {state && "error" in state && <p className="mt-1 text-sm text-red-600">Couldn&apos;t delete: {state.error}</p>}
    </form>
  );
}
