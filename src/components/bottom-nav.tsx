"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

type Counts = { tickets: number; calls: number; projects: number; repeats: number };

const icon = (d: string, color: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`h-7 w-7 ${color}`} aria-hidden>
    <path d={d} />
  </svg>
);
const HOME = "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z";
const TICKET = "M4 6h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4zM10 6v12";
const PROJECT = "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z";
// Two arrows chasing each other: a job that comes back every week or month.
const REPEAT = "M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3";
const RECEIPT = "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3";
const CLIENTS = "M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM22 19v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8";

/**
 * Phone-only menu along the bottom of the screen, like a native app: Home, Tickets, Repeats, Projects, Clients
 * and Expenses (when allowed), evenly spaced. New jobs are created from the + New button on each list.
 */
export function BottomNav({ counts, canExpenses }: { counts: Counts; canExpenses: boolean }) {
  const path = usePathname();
  const view = useSearchParams().get("view");

  const repeats = path === "/" && view === "repeats";
  const tickets = !repeats && (path === "/" || path.startsWith("/tickets"));
  // Each tab keeps its own icon color; the selected one also gets a tinted background.
  const tabs: { href: string; label: string; d: string; color: string; active: boolean; badge?: number; badgeClass?: string }[] = [
    { href: "/dashboard", label: "Home", d: HOME, color: "text-sky-600", active: path === "/dashboard" },
    { href: "/", label: "Tickets", d: TICKET, color: "text-amber-500", active: tickets, badge: counts.tickets + counts.calls, badgeClass: "bg-red-500 text-white" },
    { href: "/?view=repeats", label: "Repeats", d: REPEAT, color: "text-sky-500", active: repeats, badge: counts.repeats, badgeClass: "bg-sky-500 text-white" },
    { href: "/projects", label: "Projects", d: PROJECT, color: "text-purple-600", active: path.startsWith("/projects"), badge: counts.projects, badgeClass: "bg-red-500 text-white" },
    { href: "/clients", label: "Clients", d: CLIENTS, color: "text-teal-600", active: path.startsWith("/clients") },
    ...(canExpenses ? [{ href: "/expenses", label: "Expenses", d: RECEIPT, color: "text-green-600", active: path.startsWith("/expenses") }] : []),
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-2px_8px_rgba(0,0,0,0.06)] backdrop-blur sm:hidden print:hidden">
      <div className="mx-auto grid max-w-md gap-1" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
        {tabs.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={`relative flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] font-semibold ${t.active ? "bg-brand/10 text-brand" : "text-slate-600"}`}
          >
            {icon(t.d, t.color)}
            {t.label}
            {!!t.badge && (
              <span className={`absolute right-1/2 top-0 translate-x-5 rounded-full px-1.5 text-[10px] font-bold leading-4 ${t.badgeClass}`}>{t.badge}</span>
            )}
          </Link>
        ))}
      </div>
    </nav>
  );
}
