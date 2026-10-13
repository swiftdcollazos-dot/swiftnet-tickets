import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/lib/supabase/server";
import { computeTotals, formatMoney } from "@/lib/billing";
import { formatDate } from "@/lib/time";
import { KIND_LABELS, STATUS_LABELS, rulesOf, type TicketStatus } from "@/lib/types";
import { Loading } from "@/components/loading";

export default function TicketsPage(props: PageProps<"/">) {
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="h1">Service Tickets</h1>
        <Link href="/tickets/new" className="btn w-full sm:w-auto">+ New service ticket</Link>
      </div>
      <Suspense fallback={<Loading />}>
        <TicketList searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

const STATUS_STYLES: Record<TicketStatus, string> = {
  open: "bg-amber-100 text-amber-800",
  completed: "bg-blue-100 text-blue-800",
  paid: "bg-green-100 text-green-800",
};

async function TicketList({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const { q, status } = (await searchParams) as { q?: string; status?: string };
  const { supabase } = await requireUser();

  let query = supabase
    .from("tickets")
    .select("*, clients(name), time_entries(started_at, ended_at), ticket_parts(qty, unit_price_cents)")
    .order("number", { ascending: false })
    .limit(100);
  if (status && status in STATUS_LABELS) query = query.eq("status", status);
  if (q && /^\d+$/.test(q)) query = query.eq("number", Number(q));
  const { data: tickets, error } = await query;
  if (error) throw new Error(error.message);

  const needle = q && !/^\d+$/.test(q) ? q.toLowerCase() : "";
  const rows = (tickets ?? []).filter(
    (t) =>
      !needle ||
      [t.clients?.name, t.item_to_service, t.make, t.model]
        .join(" ")
        .toLowerCase()
        .includes(needle),
  );

  return (
    <>
      <form className="mb-4 flex gap-2">
        <input className="input" name="q" placeholder="Search client, device, service ticket #" defaultValue={q ?? ""} />
        <select className="input w-36" name="status" defaultValue={status ?? ""}>
          <option value="">All</option>
          {Object.entries(STATUS_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <button className="btn-light">Go</button>
      </form>

      {rows.length === 0 ? (
        <p className="card text-center text-slate-500">No service tickets yet. Tap “New service ticket” to create one.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((t) => {
            const totals = computeTotals(
              t.time_entries.map((e: { started_at: string; ended_at: string | null }) => ({ startedAt: e.started_at, endedAt: e.ended_at })),
              t.ticket_parts.map((p: { qty: number; unit_price_cents: number }) => ({ qty: Number(p.qty), unitPriceCents: p.unit_price_cents })),
              rulesOf(t),
              t.deposit_cents,
            );
            const running = t.time_entries.some((e: { ended_at: string | null }) => !e.ended_at);
            return (
              <li key={t.id}>
                <Link href={`/tickets/${t.id}`} className="card flex items-center gap-3 hover:border-brand">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-slate-400">#{t.number}</span>
                      <span className="truncate font-semibold">{t.clients?.name}</span>
                      {running && <span className="rounded bg-red-100 px-1.5 text-xs font-semibold text-red-700">● timer</span>}
                    </div>
                    <div className="truncate text-sm text-slate-500">
                      {formatDate(t.ticket_date)} · {KIND_LABELS[t.kind as keyof typeof KIND_LABELS]}
                      {t.item_to_service ? ` · ${t.item_to_service}` : ""}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold">{formatMoney(totals.totalCents)}</div>
                    <span className={`rounded px-1.5 text-xs font-semibold ${STATUS_STYLES[t.status as TicketStatus]}`}>
                      {STATUS_LABELS[t.status as TicketStatus]}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
