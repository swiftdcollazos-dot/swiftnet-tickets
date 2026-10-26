import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireUser } from "@/lib/supabase/server";
import { isOwner, permissions } from "@/lib/owner";
import { computeTotals, entryMinutes, formatMoney } from "@/lib/billing";
import { formatDate, todayLocal } from "@/lib/time";
import { billingType, rulesOf, type ClientType, type Settings, type Ticket } from "@/lib/types";
import { Loading } from "@/components/loading";

export default function ReportsPage(props: PageProps<"/reports">) {
  return (
    <>
      <h1 className="h1 mb-4">Reports</h1>
      <Suspense fallback={<Loading />}>
        <Report searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** First and last day of the month `offset` months from the given "YYYY-MM-DD". */
function monthRange(today: string, offset = 0): [string, string] {
  const [y, m] = today.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + offset, 1));
  const last = new Date(Date.UTC(y, m + offset, 0));
  return [first.toISOString().slice(0, 10), last.toISOString().slice(0, 10)];
}

/** Months from "YYYY-MM" to "YYYY-MM", both included; 0 if the end is before the start. */
function monthsBetween(start: string, end: string): number {
  const [sy, sm] = start.split("-").map(Number);
  const [ey, em] = end.split("-").map(Number);
  return Math.max(0, (ey - sy) * 12 + (em - sm) + 1);
}

/** Hours with one decimal, e.g. "12.5 h". */
const hrs = (minutes: number) => `${(Math.round((minutes / 60) * 10) / 10).toLocaleString("en-US")} h`;

type Row = Ticket & {
  clients: { name: string; client_type: ClientType };
  time_entries: { started_at: string; ended_at: string | null; technician_id: string | null }[];
  ticket_parts: { qty: number; unit_price_cents: number }[];
};

type Kind = "ticket" | "call" | "project";
const KIND_LABEL: Record<Kind, string> = { ticket: "Service tickets", call: "Service calls", project: "Special projects" };

async function Report({ searchParams }: { searchParams: PageProps<"/reports">["searchParams"] }) {
  const { supabase, user } = await requireUser();
  // Only the owner and users allowed in Settings > Users can see the money.
  if (!permissions(user).reports) notFound();

  const params = await searchParams;
  const today = todayLocal();
  const [monthStart, monthEnd] = monthRange(today);
  const from = typeof params.from === "string" && DATE.test(params.from) ? params.from : monthStart;
  const to = typeof params.to === "string" && DATE.test(params.to) ? params.to : monthEnd;

  const owner = isOwner(user.email);
  const [{ data, error }, { data: settings }, { data: profiles }, { data: contractClients }, { data: expenseRows }] = await Promise.all([
    supabase
      .from("tickets")
      .select("*, clients!inner(name, client_type), time_entries(started_at, ended_at, technician_id), ticket_parts(qty, unit_price_cents)")
      .gte("ticket_date", from)
      .lte("ticket_date", to)
      .order("ticket_date"),
    supabase.from("settings").select("*").single(),
    supabase.from("profiles").select("id, full_name"),
    supabase.from("clients").select("id, name, monthly_fee_cents, created_at").eq("client_type", "contract").gt("monthly_fee_cents", 0),
    // Expenses are the owner's only.
    owner ? supabase.from("expenses").select("amount_cents").gte("spent_on", from).lte("spent_on", to) : Promise.resolve({ data: [] }),
  ]);
  const expenses = (expenseRows ?? []).reduce((s, e) => s + (e.amount_cents as number), 0);
  if (error) throw new Error(error.message);
  const currency = (settings as Settings | null)?.currency ?? "USD";
  const hourlyRate = (settings as Settings | null)?.hourly_rate_cents ?? 0;
  const money = (c: number) => formatMoney(c, currency);
  const names = new Map((profiles ?? []).map((p) => [p.id as string, p.full_name as string]));

  const jobs = ((data ?? []) as unknown as Row[]).map((t) => {
    const clientType = t.clients.client_type;
    const kind: Kind = t.is_project ? "project" : clientType === "contract" ? "call" : "ticket";
    const entries = t.time_entries.map((e) => ({ startedAt: e.started_at, endedAt: e.ended_at }));
    const parts = t.ticket_parts.map((p) => ({ qty: Number(p.qty), unitPriceCents: p.unit_price_cents }));
    const totals = computeTotals(entries, parts, rulesOf(t, billingType(clientType, t.is_project)));
    // What the job would cost billed by the hour at today's rate; service calls are otherwise covered by the contract.
    const hourlyCents =
      kind === "call" ? computeTotals(entries, parts, { ...rulesOf(t, "hourly"), hourlyRateCents: hourlyRate }).totalCents : totals.totalCents;
    return { t, kind, totals, hourlyCents };
  });

  // Contract clients pay a monthly fee: count each month in the range up to this month,
  // starting from the month the client was added.
  const lastMonth = (to < today ? to : today).slice(0, 7);
  const fees = (contractClients ?? []).map((c) => {
    const added = String(c.created_at).slice(0, 7);
    const first = from.slice(0, 7) > added ? from.slice(0, 7) : added;
    const months = monthsBetween(first, lastMonth);
    return { id: c.id as string, name: c.name as string, cents: months * (c.monthly_fee_cents as number) };
  }).filter((f) => f.cents > 0);
  const feesTotal = fees.reduce((t, f) => t + f.cents, 0);

  const sum = (list: typeof jobs, pick: (j: (typeof jobs)[number]) => number) => list.reduce((s, j) => s + pick(j), 0);
  const billed = jobs.filter((j) => j.kind !== "call");
  const workedMin = sum(jobs, (j) => j.totals.workedMinutes);
  const billedMin = sum(billed, (j) => j.totals.billableMinutes);
  const earned = sum(billed, (j) => j.totals.totalCents);
  const paid = sum(billed.filter((j) => j.t.status === "paid"), (j) => j.totals.totalCents);

  const byKind = (Object.keys(KIND_LABEL) as Kind[]).map((kind) => {
    const list = jobs.filter((j) => j.kind === kind);
    return {
      kind,
      count: list.length,
      worked: sum(list, (j) => j.totals.workedMinutes),
      billed: kind === "call" ? 0 : sum(list, (j) => j.totals.billableMinutes),
      // Service calls are paid for by the contract fees.
      money: kind === "call" ? feesTotal : sum(list, (j) => j.totals.totalCents),
    };
  });

  const callKind = byKind.find((k) => k.kind === "call")!;
  const ticketKind = byKind.find((k) => k.kind === "ticket")!;

  // Hours each technician logged on these jobs, from their own timer entries, split by job type.
  const techMinutes = new Map<string, Record<Kind, number>>();
  for (const { t, kind } of jobs) {
    for (const e of t.time_entries) {
      const key = e.technician_id ?? "";
      const row = techMinutes.get(key) ?? { ticket: 0, call: 0, project: 0 };
      row[kind] += entryMinutes({ startedAt: e.started_at, endedAt: e.ended_at });
      techMinutes.set(key, row);
    }
  }
  const byTech = [...techMinutes]
    .map(([id, r]) => ({ name: names.get(id) || "Unknown", ...r, total: r.ticket + r.call + r.project }))
    .sort((a, b) => b.total - a.total);

  const clientMap = new Map<string, { name: string; jobs: number; worked: number; money: number; hourly: number }>();
  for (const j of jobs) {
    const row = clientMap.get(j.t.client_id) ?? { name: j.t.clients.name, jobs: 0, worked: 0, money: 0, hourly: 0 };
    row.jobs += 1;
    row.worked += j.totals.workedMinutes;
    row.hourly += j.hourlyCents;
    if (j.kind !== "call") row.money += j.totals.totalCents;
    clientMap.set(j.t.client_id, row);
  }
  for (const f of fees) {
    const row = clientMap.get(f.id) ?? { name: f.name, jobs: 0, worked: 0, money: 0, hourly: 0 };
    row.money += f.cents;
    clientMap.set(f.id, row);
  }
  const byClient = [...clientMap.values()].sort((a, b) => b.money - a.money || b.worked - a.worked);

  const [lastStart, lastEnd] = monthRange(today, -1);
  const year = today.slice(0, 4);
  const presets: [string, string, string][] = [
    ["This month", monthStart, monthEnd],
    ["Last month", lastStart, lastEnd],
    ["This year", `${year}-01-01`, `${year}-12-31`],
  ];

  return (
    <div className="space-y-6">
      {/* Date range */}
      <section className="card space-y-3">
        <div className="flex flex-wrap gap-2">
          {presets.map(([label, f, t]) => (
            <Link
              key={label}
              href={`/reports?from=${f}&to=${t}`}
              className={`rounded-full border px-3 py-1 text-sm font-semibold ${from === f && to === t ? "border-brand bg-brand text-white" : "border-slate-300 text-slate-700 hover:bg-slate-50"}`}
            >
              {label}
            </Link>
          ))}
        </div>
        <form className="flex flex-wrap items-end gap-2" action="/reports">
          <label className="text-sm">
            <span className="label">From</span>
            <input className="input" type="date" name="from" defaultValue={from} />
          </label>
          <label className="text-sm">
            <span className="label">To</span>
            <input className="input" type="date" name="to" defaultValue={to} />
          </label>
          <button className="btn">Show</button>
        </form>
        <p className="text-sm text-slate-500">
          {formatDate(from)} – {formatDate(to)} · {jobs.length} {jobs.length === 1 ? "job" : "jobs"}, by job date
        </p>
      </section>

      {/* Headline numbers */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Hours worked" value={hrs(workedMin)} note="all jobs" />
        <Stat label="Hours billed" value={hrs(billedMin)} note="tickets & projects" />
        <Stat label="Total money" value={money(earned + feesTotal)} note={`${money(earned)} jobs + ${money(feesTotal)} contracts`} />
        <Stat label="Jobs paid" value={money(paid)} note={`${money(earned - paid)} not paid yet`} />
      </div>

      {/* Profit, for the owner: money in minus expenses in the same dates. */}
      {owner && (
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Expenses" value={money(expenses)} note="from Office > Expenses" />
          <Stat label="Profit" value={money(earned + feesTotal - expenses)} note="total money minus expenses" />
        </div>
      )}

      {/* Contract time vs. time charged on service tickets */}
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Contract hours" value={hrs(callKind.worked)} note={`${callKind.count} service ${callKind.count === 1 ? "call" : "calls"}, covered by contracts`} />
        <Stat label="Billable hours" value={hrs(ticketKind.billed)} note={`${ticketKind.count} service ${ticketKind.count === 1 ? "ticket" : "tickets"}, charged by the hour`} />
      </div>

      <Table
        title="By type"
        head={["Type", "Jobs", "Worked", "Billed", "Money"]}
        rows={byKind.map((k) => [
          KIND_LABEL[k.kind],
          String(k.count),
          hrs(k.worked),
          k.kind === "call" ? "—" : hrs(k.billed),
          money(k.money),
        ])}
        foot={["Total", String(jobs.length), hrs(workedMin), hrs(billedMin), money(earned + feesTotal)]}
      />

      <Table
        title="By technician"
        head={["Technician", "Tickets", "Calls", "Projects", "Total"]}
        rows={byTech.map((t) => [t.name, hrs(t.ticket), hrs(t.call), hrs(t.project), hrs(t.total)])}
        empty="No time logged in this period."
      />

      <Table
        title="By client"
        head={["Client", "Jobs", "Worked", "Money", `At ${money(hourlyRate)}/h`]}
        rows={byClient.map((c) => [c.name, String(c.jobs), hrs(c.worked), c.money ? money(c.money) : "—", c.hourly ? money(c.hourly) : "—"])}
        empty="No jobs in this period."
      />

      <p className="text-xs text-slate-500">
        Service calls are covered by the client&apos;s contract: their money is the contract clients&apos; monthly fees for each month in the range, up to this month. The last By client column is what each client&apos;s jobs would cost billed by the hour at {money(hourlyRate)}/h, so you can compare a contract&apos;s monthly fee with the time spent. Two technicians working at the same time are billed once. Running timers count up to now.
      </p>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="card">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{value}</div>
      <div className="text-xs text-slate-500">{note}</div>
    </div>
  );
}

function Table({ title, head, rows, foot, empty }: { title: string; head: string[]; rows: string[][]; foot?: string[]; empty?: string }) {
  return (
    <section className="card overflow-x-auto">
      <h2 className="h2 mb-2">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">{empty}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              {head.map((h, i) => (
                <th key={h} className={`py-2 pr-3 font-semibold ${i > 0 ? "text-right" : ""}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri} className="border-b border-slate-100 last:border-0">
                {r.map((cell, i) => (
                  <td key={i} className={`py-2 pr-3 ${i > 0 ? "whitespace-nowrap text-right tabular-nums" : "font-medium"}`}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
          {foot && (
            <tfoot>
              <tr className="border-t-2 border-slate-300 font-bold">
                {foot.map((cell, i) => (
                  <td key={i} className={`py-2 pr-3 ${i > 0 ? "whitespace-nowrap text-right tabular-nums" : ""}`}>{cell}</td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      )}
    </section>
  );
}
