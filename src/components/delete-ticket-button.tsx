"use client";

import { useActionState } from "react";
import { deleteTicket } from "@/app/actions";

export function DeleteTicketButton({ ticketId, label }: { ticketId: string; label: string }) {
  const [state, action, pending] = useActionState(() => deleteTicket(ticketId), null);
  return (
    <form
      action={action}
      className="flex flex-col items-center pt-2"
      onSubmit={(e) => {
        if (!confirm(`Delete this ${label}? Its time, parts and signature are deleted too. This can't be undone.`)) e.preventDefault();
      }}
    >
      <button className="btn-danger px-6" disabled={pending}>{pending ? "Deleting…" : `Delete ${label}`}</button>
      {state && "error" in state && <p className="mt-1 text-sm text-red-600">Couldn&apos;t delete: {state.error}</p>}
    </form>
  );
}
