"use client";

import { useState } from "react";
import { ClientTypeFields } from "@/components/client-type-fields";
import type { Client } from "@/lib/types";

export function ClientPicker({ clients }: { clients: Client[] }) {
  const [clientId, setClientId] = useState("");
  return (
    <div className="space-y-3">
      <div>
        <label className="label" htmlFor="client_id">Client</label>
        <select className="input" id="client_id" name="client_id" value={clientId} onChange={(e) => setClientId(e.target.value)}>
          <option value="">+ New client</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ""}</option>
          ))}
        </select>
      </div>
      {!clientId && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="client_name">Name</label>
            <input className="input" id="client_name" name="client_name" required />
          </div>
          <div>
            <label className="label" htmlFor="client_phone">Phone</label>
            <input className="input" type="tel" id="client_phone" name="client_phone" />
          </div>
          <div>
            <label className="label" htmlFor="client_email">Email</label>
            <input className="input" type="email" id="client_email" name="client_email" />
          </div>
          <div>
            <label className="label" htmlFor="client_address">Address</label>
            <input className="input" id="client_address" name="client_address" />
          </div>
          <ClientTypeFields idPrefix="new" typeName="client_type" feeName="client_monthly_fee" />
        </div>
      )}
    </div>
  );
}
