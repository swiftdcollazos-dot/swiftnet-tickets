"use client";

import { useEffect, useRef, useState } from "react";
import { ClientTypeFields } from "@/components/client-type-fields";
import { RequiredNote } from "@/components/required-note";
import type { Client } from "@/lib/types";

/** Search existing clients by name, or add a new one. */
export function ClientPicker({ clients, serviceCall = false }: { clients: Client[]; serviceCall?: boolean }) {
  const [adding, setAdding] = useState(clients.length === 0);
  const [selected, setSelected] = useState<Client | null>(null);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const newLabel = serviceCall ? "+ New contract client" : "+ New client";

  // The browser won't submit until a client from the list is picked.
  useEffect(() => {
    searchRef.current?.setCustomValidity(selected ? "" : "Pick a client from the list.");
  }, [selected, adding]);

  const needle = search.trim().toLowerCase();
  const matches = clients.filter((c) => c.name.toLowerCase().includes(needle));

  if (adding) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="h2 mb-0">{serviceCall ? "New contract client" : "New client"}</h2>
          {clients.length > 0 && (
            <button type="button" className="text-sm font-semibold text-brand" onClick={() => setAdding(false)}>
              Choose an existing client
            </button>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <RequiredNote className="sm:col-span-2" />
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
          <ClientTypeFields idPrefix="new" typeName="client_type" feeName="client_monthly_fee" type={serviceCall ? "contract" : "hourly"} locked />
        </div>
      </div>
    );
  }

  return (
    <div>
      <input type="hidden" name="client_id" value={selected?.id ?? ""} />
      {selected ? (
        <>
          <p className="label">Client</p>
          <div className="flex items-center gap-3 rounded-lg border border-brand bg-blue-50 px-3 py-3">
            <span className="flex-1 text-base font-semibold">{selected.name}</span>
            <button type="button" className="text-sm font-semibold text-brand" onClick={() => setSelected(null)}>
              Change
            </button>
          </div>
        </>
      ) : (
        <>
          <label className="label" htmlFor="client_search">Client</label>
          <input
            ref={searchRef}
            className="input"
            id="client_search"
            type="search"
            placeholder="Type to search clients"
            autoComplete="off"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            required
          />
          <ul className="mt-2 max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 bg-white" role="listbox" aria-label="Clients">
            {matches.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  className="block w-full px-3 py-3 text-left text-base hover:bg-slate-50 active:bg-slate-100"
                  onClick={() => {
                    setSelected(c);
                    setSearch("");
                  }}
                >
                  {c.name}
                </button>
              </li>
            ))}
            {matches.length === 0 && <li className="px-3 py-3 text-sm text-slate-500">No client called “{search.trim()}”.</li>}
          </ul>
          <button type="button" className="btn-light mt-3 w-full" onClick={() => setAdding(true)}>
            {newLabel}
          </button>
        </>
      )}
    </div>
  );
}
