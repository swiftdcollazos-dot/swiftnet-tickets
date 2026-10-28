import Link from "next/link";
import { Fragment } from "react";
import { requireUser } from "@/lib/supabase/server";
import { computeTotals, formatMinutes, formatMoney, notBilled } from "@/lib/billing";
import { formatDate } from "@/lib/time";
import { STATUS_LABELS, billingType, jobItemParts, kindLabel, rulesOf, type TicketStatus } from "@/lib/types";
import { Loading } from "@/components/loading";
import { CountBadge } from "@/components/pending-badge";
import { PaidStamp } from "@/components/paid-stamp";
import { pendingCounts } from "@/lib/pending";
import { permissions } from "@/lib/owner";

const STATUS_STYLES: Record<TicketStatus, string> = {
  open: "bg-amber-100 text-amber-800",
  completed: "bg-blue-100 text-blue-800",
  sent: "bg-violet-100 text-violet-800",
  paid: "bg-green-100 text-green-800",
};

const TABS = [
  { view: "", path: "/", title: "Service Tickets", count: "tickets", newPath: "/tickets/new", frame: "border-amber-400", badge: "bg-amber-400 text-slate-900" },
  { view: "calls", path: "/?view=calls", title: "Service Calls", count: "calls", newPath: "/tickets/new?call=1", frame: "border-red-500", badge: "bg-red-500 text-white" },
  { view: "completed", path: "/?view=completed", title: "Completed", count: "", newPath: "", frame: "border-green-500", badge: "" },
  { view: "sent", path: "/?view=sent", title: "Sent to Customer", count: "", newPath: "", frame: "border-green-500", badge: "" },
  { view: "paid", path: "/?view=paid", title: "Paid", count: "", newPath: "", frame: "border-green-500", badge: "" },
  { view: "projects", path: "/projects", title: "Special Projects", count: "projects", newPath: "/tickets/new?project=1", frame: "border-purple-500", badge: "bg-purple-500 text-white" },
] as const;

const PROJECTS = TABS[5];

/** Work Tickets buttons: filled in their color when selected, outlined otherwise. */
const BUTTON_LOOK: Record<string, { on: string; off: string }> = {
  "": { on: "border-amber-500 bg-amber-400 text-slate-900", off: "border-amber-400 bg-white text-amber-700 hover:bg-amber-50" },
  calls: { on: "border-red-600 bg-red-500 text-white", off: "border-red-400 bg-white text-red-700 hover:bg-red-50" },
  completed: { on: "border-blue-700 bg-blue-600 text-white", off: "border-blue-300 bg-white text-blue-700 hover:bg-blue-50" },
  sent: { on: "border-violet-700 bg-violet-600 text-white", off: "border-violet-300 bg-white text-violet-700 hover:bg-violet-50" },
  paid: { on: "border-green-700 bg-green-600 text-white", off: "border-green-300 bg-white text-green-700 hover:bg-green-50" },
};

/** The finished-job tabs, each showing one status: closed, sent to the customer, paid. */
const DONE_STATUS: Record<string, TicketStatus> = { completed: "completed", sent: "sent", paid: "paid" };
const DONE_NOTE: Record<string, string> = {
  completed: "Closed service tickets and service calls, not yet sent to the customer.",
  sent: "Service tickets and service calls sent to the customer, waiting to be paid.",
  paid: "Service tickets and service calls that are paid.",
};

/**
 * A list of jobs. Work Tickets shows the Service Tickets / Service Calls tabs and the Completed / Sent to Customer / Paid tabs;
 * Special Projects has its own page in the header.
 */
export async function JobListPage({ searchParams, projects = false }: { searchParams: Promise<Record<string, string | string[] | undefined>>; projects?: boolean }) {
  const { q, status, view } = (await searchParams) as { q?: string; status?: string; view?: string };
  // Service calls are the jobs for contract clients; service tickets and special projects, for hourly clients.
  const tab = projects ? PROJECTS : (TABS.find((t) => t.view === view && t !== PROJECTS) ?? TABS[0]);
  const calls = tab.view === "calls";
  // Finished service tickets and service calls together, one status per tab.
  const doneStatus = DONE_STATUS[tab.view];
  const completed = Boolean(doneStatus);
  const label = completed ? "job" : tab.title.slice(0, -1).toLowerCase();
  const { supabase, user } = await requireUser();
  // Special projects can be created by anyone; service tickets and calls only by users allowed to.
  const canCreate = projects || permissions(user).createJobs;

  let query = supabase
    .from("tickets")
    .select("*, clients!inner(name, client_type, internal), time_entries(started_at, ended_at), ticket_parts(qty, unit_price_cents), expense_items(amount_cents, markup_pct)")
    .eq("is_project", tab.view === "projects")
    // Open jobs first (status order: open, closed, sent, paid), newest first within each.
    .order("status")
    .order("number", { ascending: false })
    .limit(completed ? 300 : 100);
  // Special projects can be for any client.
  if (completed) query = query.eq("status", doneStatus);
  else if (tab.view !== "projects") query = query.eq("clients.client_type", calls ? "contract" : "hourly");
  if (!completed && status && status in STATUS_LABELS) query = query.eq("status", status);
  if (q && /^\d+$/.test(q)) query = query.eq("number", Number(q));
  const [{ data: tickets, error }, pending] = await Promise.all([query, pendingCounts(supabase)]);
  if (error) throw new Error(error.message);

  const needle = q && !/^\d+$/.test(q) ? q.toLowerCase() : "";
  const rows = (tickets ?? []).filter(
    (t) =>
      !needle ||
      [t.clients?.name, t.item_to_service, t.make, t.model, t.machine_name]
        .join(" ")
        .toLowerCase()
        .includes(needle),
  );
  // Completed: hourly clients' tickets first, then contract clients' calls, each newest first.
  if (completed) rows.sort((a, b) => Number(a.clients?.client_type === "contract") - Number(b.clients?.client_type === "contract"));
  // Jobs being worked on right now (a timer running) go to the very top.
  else {
    const isRunning = (t: (typeof rows)[number]) => t.time_entries.some((e: { ended_at: string | null }) => !e.ended_at);
    rows.sort((a, b) => Number(isRunning(b)) - Number(isRunning(a)));
  }

  return (
    <>
      {!projects && (
        <div className="mb-4 grid grid-cols-6 gap-2 text-center text-sm font-bold">
          {TABS.slice(0, 5).map((t, i) => {
            const active = t === tab;
            const look = BUTTON_LOOK[t.view];
            return (
              <Link
                key={t.view}
                href={t.path}
                aria-current={active ? "page" : undefined}
                className={`flex items-center justify-center rounded-xl border-2 px-2 leading-tight shadow-sm transition active:scale-95 ${i < 2 ? "col-span-3 py-3 text-base" : "col-span-2 py-2.5"} ${active ? `${look.on} shadow-md` : look.off}`}
              >
                {t.title} {t.count && <CountBadge count={pending[t.count]} className={active ? "bg-white text-slate-900" : t.badge} />}
              </Link>
            );
          })}
        </div>
      )}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="h1">{tab.title}</h1>
        {tab.newPath && canCreate && <Link href={tab.newPath} className="btn w-full sm:w-auto">+ New {label}</Link>}
      </div>
      {calls && <p className="-mt-2 mb-4 text-sm text-slate-500">For contract clients. Time is tracked, not charged.</p>}
      {completed && <p className="-mt-2 mb-4 text-sm text-slate-500">{DONE_NOTE[tab.view]}</p>}
      <form className="mb-4 flex gap-2">
        {(calls || completed) && <input type="hidden" name="view" value={tab.view} />}
        <input className="input" name="q" placeholder={`Search client, device, ${label} #`} defaultValue={q ?? ""} />
        {!completed && (
          <select className="input w-36" name="status" defaultValue={status ?? ""}>
            <option value="">All</option>
            {Object.entries(STATUS_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        )}
        <button className="btn-light">Go</button>
      </form>

      {rows.length === 0 ? (
        <p className="card text-center text-slate-500">{completed ? "Nothing here yet." : <>No {label}s yet.{canCreate && <> Tap “New {label}” to create one.</>}</>}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((t, i) => {
            const computed = computeTotals(
              t.time_entries.map((e: { started_at: string; ended_at: string | null }) => ({ startedAt: e.started_at, endedAt: e.ended_at })),
              [
                ...t.ticket_parts.map((p: { qty: number; unit_price_cents: number }) => ({ qty: Number(p.qty), unitPriceCents: p.unit_price_cents })),
                ...jobItemParts(t.expense_items),
              ],
              rulesOf(t, billingType(t.clients?.client_type, t.is_project)),
              t.deposit_cents,
            );
            const totals = t.clients?.internal ? notBilled(computed) : computed;
            const running = t.time_entries.some((e: { ended_at: string | null }) => !e.ended_at);
            const isCall = t.clients?.client_type === "contract";
            // Completed: a heading where each group (tickets, then calls) starts.
            const groupStart = completed && (i === 0 || isCall !== (rows[i - 1].clients?.client_type === "contract"));
            return (
              <Fragment key={t.id}>
              {groupStart && (
                <li className={`h2 border-b border-slate-200 pb-1 ${i > 0 ? "pt-4" : ""}`}>{isCall ? "Service calls" : "Service tickets"}</li>
              )}
              <li>
                <Link href={`/tickets/${t.id}`} className={`card flex items-center gap-3 border-2 ${t.status !== "open" ? "border-green-500" : tab.frame}`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-slate-400">#{t.number}</span>
                      <span className="truncate font-semibold">{t.clients?.name}</span>
                      {running && <span className="rounded bg-red-100 px-1.5 text-xs font-semibold text-red-700">● timer</span>}
                      {completed && (
                        <span className={`shrink-0 rounded px-1.5 text-xs font-semibold ${isCall ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"}`}>
                          {isCall ? "Call" : "Ticket"}
                        </span>
                      )}
                    </div>
                    {t.is_project && t.item_to_service && <div className="truncate font-semibold text-purple-700">{t.item_to_service}</div>}
                    <div className="truncate text-sm text-slate-500">
                      {[formatDate(t.ticket_date), kindLabel(t.kind)].filter(Boolean).join(" · ")}
                      {!t.is_project && t.item_to_service ? ` · ${t.item_to_service}` : ""}
                    </div>
                  </div>
                  {t.status === "paid" && !calls && !(completed && isCall) && <PaidStamp className="w-14" />}
                  <div className="text-right">
                    <div className="font-semibold">{t.clients?.internal ? formatMinutes(totals.jobMinutes) : formatMoney(totals.totalCents)}</div>
                    <span className={`rounded px-1.5 text-xs font-semibold ${STATUS_STYLES[t.status as TicketStatus]}`}>
                      {STATUS_LABELS[t.status as TicketStatus]}
                    </span>
                  </div>
                </Link>
              </li>
              </Fragment>
            );
          })}
        </ul>
      )}
    </>
  );
}
