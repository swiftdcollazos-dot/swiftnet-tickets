"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Client } from "@/lib/types";

/** Dropdown of client names. New clients are added on the Clients page. */
export function ClientPicker({
  clients,
  serviceCall = false,
  initial = null,
}: {
  clients: Client[];
  serviceCall?: boolean;
  initial?: Client | null;
}) {
  const [selected, setSelected] = useState<Client | null>(initial);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const guardRef = useRef<HTMLInputElement>(null);

  // The browser won't submit until a client from the list is picked.
  useEffect(() => {
    guardRef.current?.setCustomValidity(selected ? "" : "Select a client.");
  }, [selected]);

  const needle = search.trim().toLowerCase();
  const matches = clients.filter((c) => c.name.toLowerCase().includes(needle));

  if (clients.length === 0) {
    return (
      <div>
        <span className="label">Client</span>
        <p className="text-sm text-slate-600">
          {serviceCall ? "There are no contract clients yet." : "There are no hourly clients yet."}{" "}
          <Link href="/clients" className="font-semibold text-brand">Add one on the Clients page</Link> first.
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      <input type="hidden" name="client_id" value={selected?.id ?? ""} />
      {/* Invisible stand-in so the browser can say "pick a client" when none is chosen. */}
      <input
        ref={guardRef}
        tabIndex={-1}
        aria-hidden
        required
        value={selected?.id ?? ""}
        onChange={() => {}}
        onInvalid={() => setOpen(true)}
        className="pointer-events-none absolute bottom-0 left-1/2 h-px w-px opacity-0"
      />
      <span className="label">
        Client <span className="font-bold text-red-600">*</span>
      </span>
      <button
        type="button"
        className="input flex items-center justify-between text-left"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={selected ? "font-semibold" : "text-slate-400"}>{selected?.name ?? "Select a client"}</span>
        <span className="text-slate-500">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="absolute inset-x-0 z-20 mt-1 rounded-lg border border-slate-200 bg-white shadow-lg">
          {clients.length > 8 && (
            <div className="border-b border-slate-100 p-2">
              <input
                className="input"
                type="search"
                placeholder="Search"
                autoComplete="off"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search clients"
              />
            </div>
          )}
          <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto" role="listbox" aria-label="Clients">
            {matches.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected?.id === c.id}
                  className={`block w-full px-3 py-3 text-left text-base hover:bg-slate-50 ${selected?.id === c.id ? "font-semibold text-brand" : ""}`}
                  onClick={() => {
                    setSelected(c);
                    setSearch("");
                    setOpen(false);
                  }}
                >
                  {c.name}
                </button>
              </li>
            ))}
            {matches.length === 0 && <li className="px-3 py-3 text-sm text-slate-500">No client called “{search.trim()}”.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
