"use client";

import { deleteClient } from "@/app/actions";

export function DeleteClientButton({ clientId, name }: { clientId: string; name: string }) {
  return (
    <form
      action={deleteClient.bind(null, clientId)}
      onSubmit={(e) => {
        if (!confirm(`Delete ${name}? This can't be undone.`)) e.preventDefault();
      }}
    >
      <button className="btn-danger w-full">Delete client</button>
    </form>
  );
}
