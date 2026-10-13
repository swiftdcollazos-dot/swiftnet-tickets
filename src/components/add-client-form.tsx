"use client";

import { useRef, type ReactNode } from "react";
import { createClientRecord } from "@/app/actions";

/** "+ Add client" panel that clears and closes itself after saving. */
export function AddClientForm({ children }: { children: ReactNode }) {
  const panel = useRef<HTMLDetailsElement>(null);
  const form = useRef<HTMLFormElement>(null);
  return (
    <details ref={panel} className="card mb-6">
      <summary className="cursor-pointer font-semibold text-brand">+ Add client</summary>
      <form
        ref={form}
        action={async (data) => {
          await createClientRecord(data);
          form.current?.reset();
          if (panel.current) panel.current.open = false;
        }}
        className="mt-3 grid gap-3 sm:grid-cols-2"
      >
        {children}
        <button className="btn sm:col-span-2">Add client</button>
      </form>
    </details>
  );
}
