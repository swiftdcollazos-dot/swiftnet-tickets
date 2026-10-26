"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

type Counts = { tickets: number; calls: number; projects: number };

const icon = (d: string, color: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`h-7 w-7 ${color}`} aria-hidden>
    <path d={d} />
  </svg>
);
const HOME = "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z";
const TICKET = "M4 6h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4zM10 6v12";
const PROJECT = "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z";
const CLIENTS = "M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM22 19v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8";

/**
 * Phone-only menu along the bottom of the screen, like a native app: Home, Tickets, a big New button,
 * Projects and Clients. New opens a short list of what you're allowed to create.
 */
export function BottomNav({ counts, canCreateJobs }: { counts: Counts; canCreateJobs: boolean }) {
  const path = usePathname();
  const view = useSearchParams().get("view");
  const [sheet, setSheet] = useState(false);
  useEffect(() => setSheet(false), [path, view]);

  const tickets = path === "/" || path.startsWith("/tickets");
  // Each tab keeps its own icon color; the selected one also gets a tinted background.
  const tabs: { href: string; label: string; d: string; color: string; active: boolean; badge?: number; badgeClass?: string }[] = [
    { href: "/dashboard", label: "Home", d: HOME, color: "text-sky-600", active: path === "/dashboard" },
    { href: "/", label: "Tickets", d: TICKET, color: "text-amber-500", active: tickets, badge: counts.tickets + counts.calls, badgeClass: "bg-red-500 text-white" },
    { href: "/projects", label: "Projects", d: PROJECT, color: "text-purple-600", active: path.startsWith("/projects"), badge: counts.projects, badgeClass: "bg-red-500 text-white" },
    { href: "/clients", label: "Clients", d: CLIENTS, color: "text-teal-600", active: path.startsWith("/clients") },
  ];
  const tab = (t: (typeof tabs)[number]) => (
    <Link
      key={t.href}
      href={t.href}
      className={`relative flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] font-semibold ${t.active ? "bg-brand/10 text-brand" : "text-slate-600"}`}
    >
      {icon(t.d, t.color)}
      {t.label}
      {!!t.badge && (
        <span className={`absolute right-1/2 top-0 translate-x-5 rounded-full px-1.5 text-[10px] font-bold leading-4 ${t.badgeClass}`}>{t.badge}</span>
      )}
    </Link>
  );

  return (
    <>
      {sheet && <div className="fixed inset-0 z-30 bg-slate-900/30 sm:hidden" onClick={() => setSheet(false)} />}
      {sheet && (
        <div className="fixed inset-x-3 bottom-24 z-40 space-y-2 rounded-2xl bg-white p-3 shadow-xl sm:hidden">
          {canCreateJobs && (
            <>
              <NewLink href="/tickets/new" color="bg-amber-400 text-slate-900">New service ticket</NewLink>
              <NewLink href="/tickets/new?call=1" color="bg-red-500 text-white">New service call</NewLink>
            </>
          )}
          <NewLink href="/tickets/new?project=1" color="bg-purple-500 text-white">New special project</NewLink>
        </div>
      )}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-2px_8px_rgba(0,0,0,0.06)] backdrop-blur sm:hidden print:hidden">
        <div className="mx-auto flex max-w-md items-end gap-1">
          {tabs.slice(0, 2).map(tab)}
          <button
            type="button"
            onClick={() => setSheet((s) => !s)}
            aria-expanded={sheet}
            className="flex flex-1 flex-col items-center gap-0.5 text-[11px] font-semibold text-brand"
          >
            <span className={`-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-brand text-3xl leading-none text-white shadow-lg transition ${sheet ? "rotate-45" : ""}`}>+</span>
            New
          </button>
          {tabs.slice(2).map(tab)}
        </div>
      </nav>
    </>
  );
}

function NewLink({ href, color, children }: { href: string; color: string; children: ReactNode }) {
  return (
    <Link href={href} className={`block rounded-xl px-4 py-3 text-center text-base font-bold ${color}`}>
      + {children}
    </Link>
  );
}
