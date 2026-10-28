import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/lib/supabase/server";
import { permissions } from "@/lib/owner";
import { redirect } from "next/navigation";
import { formatMoney } from "@/lib/billing";
import { formatDate, todayLocal } from "@/lib/time";
import { saveExpense } from "@/app/actions";
import { ExpenseForm } from "@/components/expense-form";
import { Loading } from "@/components/loading";
import { resaleCents, type Expense } from "@/lib/types";

// Reading a receipt can take a little while.
export const maxDuration = 60;

export default function ExpensesPage(props: PageProps<"/expenses">) {
  return (
    <>
      <h1 className="h1 mb-4">Expenses</h1>
      <Suspense fallback={<Loading />}>
        <Expenses searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

/** "2026-10" moved by `offset` months. */
function shiftMonth(month: string, offset: number): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + offset, 1)).toISOString().slice(0, 7);
}

const monthName = (month: string) =>
  new Date(`${month}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

async function Expenses({ searchParams }: { searchParams: PageProps<"/expenses">["searchParams"] }) {
  const { supabase, user } = await requireUser();
  // Techs see the expenses they reported; the owner sees everyone's (the database enforces this too).
  if (!permissions(user).expenses) redirect("/dashboard");
  // The owner and Office users see everyone's expenses, with who reported each.
  const owner = permissions(user).office;

  const params = await searchParams;
  const today = todayLocal();
  // ?month=all lists every expense ever added, split by month.
  const all = params.month === "all";
  const month = typeof params.month === "string" && /^\d{4}-\d{2}$/.test(params.month) ? params.month : today.slice(0, 7);
  let query = supabase
    .from("expenses")
    .select("id, spent_on, vendor, category, description, amount_cents, tax_cents, payment_method, vehicle, created_by, expense_items(amount_cents, markup_pct, charged, bill_client_id, clients(name))")
    .order("spent_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (!all) query = query.gte("spent_on", `${month}-01`).lt("spent_on", `${shiftMonth(month, 1)}-01`);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  type Charge = { amount_cents: number; markup_pct: number; charged: boolean; bill_client_id: string | null; clients: { name: string } | null };
  type Row = Omit<Expense, "receipt" | "created_at"> & { created_by: string | null; expense_items: Charge[] };
  const expenses = (data ?? []) as unknown as Row[];
  const { data: clientRows } = await supabase.from("clients").select("id, name").order("name");
  const { data: profiles } = owner ? await supabase.from("profiles").select("id, full_name") : { data: [] };
  const names = new Map((profiles ?? []).map((p) => [p.id as string, p.full_name as string]));
  // Whoever sees everyone's expenses gets the name of the person who added each one.
  const reporter = (id: string | null) => (owner && id ? names.get(id) : undefined);

  const total = expenses.reduce((sum, e) => sum + e.amount_cents, 0);
  // What was bought for customers (at cost); everything else is Swiftnet IT's own spending.
  const forCustomers = expenses.reduce(
    (sum, e) => sum + Math.min(e.amount_cents, e.expense_items.filter((it) => it.bill_client_id).reduce((s, it) => s + it.amount_cents, 0)),
    0,
  );
  const ownSpending = total - forCustomers;
  const byCategory = new Map<string, number>();
  for (const e of expenses) byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amount_cents);
  const categories = [...byCategory].sort((a, b) => b[1] - a[1]);
  // The list is split by month, each with its own heading and total.
  const byMonth = new Map<string, Row[]>();
  for (const e of expenses) byMonth.set(e.spent_on.slice(0, 7), [...(byMonth.get(e.spent_on.slice(0, 7)) ?? []), e]);
  const yearTotals = new Map<string, number>();
  for (const e of expenses) yearTotals.set(e.spent_on.slice(0, 4), (yearTotals.get(e.spent_on.slice(0, 4)) ?? 0) + e.amount_cents);

  return (
    <div className="space-y-4">
      <details className="card group" open={expenses.length === 0}>
        <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between [&::-webkit-details-marker]:hidden">
          <h2 className="h2 mb-0">+ Add expense</h2>
          <span className="text-sm text-slate-500 transition-transform group-open:rotate-180">▼</span>
        </summary>
        <div className="mt-3">
          <ExpenseForm today={today} clients={clientRows ?? []} save={saveExpense.bind(null, null)} />
        </div>
      </details>

      {all ? (
        <div className="flex items-center justify-between">
          <h2 className="h2 mb-0">All expenses</h2>
          <Link href="/expenses" className="btn-light">By month</Link>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Link href={`/expenses?month=${shiftMonth(month, -1)}`} className="btn-light px-3" aria-label="Previous month">‹</Link>
            <h2 className="h2 mb-0">{monthName(month)}</h2>
            <Link href={`/expenses?month=${shiftMonth(month, 1)}`} className="btn-light px-3" aria-label="Next month">›</Link>
          </div>
          <Link href="/expenses?month=all" className="block text-center text-sm font-semibold text-brand underline">
            Show all years
          </Link>
        </div>
      )}

      <div className="card flex items-end justify-between">
        <div>
          <p className="label">{owner ? "Spent" : "You spent"}</p>
          <p className="text-2xl font-bold">{formatMoney(total)}</p>
        </div>
        <p className="text-sm text-slate-500">
          {expenses.length} {expenses.length === 1 ? "expense" : "expenses"}
        </p>
      </div>

      {total > 0 && (
        <div className="grid grid-cols-2 gap-2">
          <div className="card">
            <p className="label">Spent on Swiftnet IT</p>
            <p className="text-xl font-bold">{formatMoney(ownSpending)}</p>
            <p className="text-xs text-slate-500">our own company</p>
          </div>
          <div className="card">
            <p className="label">Bought for customers</p>
            <p className="text-xl font-bold">{formatMoney(forCustomers)}</p>
            <p className="text-xs text-slate-500">at cost, to charge them</p>
          </div>
        </div>
      )}

      {categories.length > 0 && (
        <div className="card">
          <h2 className="h2">By category</h2>
          <ul className="divide-y divide-slate-100 text-sm">
            {categories.map(([name, cents]) => (
              <li key={name} className="flex justify-between py-1.5">
                <span>{name}</span>
                <span className="font-semibold">{formatMoney(cents)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {expenses.length === 0 ? (
        <p className="card text-center text-slate-500">{all ? "No expenses yet." : `No expenses in ${monthName(month)}.`}</p>
      ) : (
        [...byMonth].map(([m, rows], i, months) => (
          <section key={m} className="space-y-2">
            {all && m.slice(0, 4) !== months[i - 1]?.[0].slice(0, 4) && (
              <div className="mt-4 flex items-baseline justify-between rounded-lg bg-slate-800 px-3 py-2 text-white">
                <h3 className="text-lg font-bold">{m.slice(0, 4)}</h3>
                <span className="font-bold">{formatMoney(yearTotals.get(m.slice(0, 4)) ?? 0)}</span>
              </div>
            )}
            {all && (
              <div className="flex items-baseline justify-between border-b-2 border-slate-300 pb-1 pt-2">
                <h4 className="font-bold text-slate-700">{monthName(m)}</h4>
                <span className="text-sm font-semibold text-slate-600">{formatMoney(rows.reduce((sum, e) => sum + e.amount_cents, 0))}</span>
              </div>
            )}
            <ul className="space-y-2">
              {rows.map((e) => (
                <li key={e.id}>
                  <Link href={`/expenses/${e.id}`} className="card flex items-center justify-between gap-3 hover:bg-slate-50">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{e.vendor}</span>
                      <span className="block truncate text-sm text-slate-500">
                        {reporter(e.created_by) && <span className="font-semibold text-brand">{reporter(e.created_by)} · </span>}
                        {formatDate(e.spent_on)} · {e.category}
                        {e.vehicle ? ` (${e.vehicle})` : ""}
                        {e.description ? ` · ${e.description}` : ""}
                      </span>
                      {chargesByClient(e.expense_items).map((c) => (
                        <span key={c.name} className={`block truncate text-sm font-semibold ${c.allSent ? "text-slate-500" : "text-green-700"}`}>
                          {c.allSent ? "Sent to" : "Charge"} {c.name} {formatMoney(c.cents)}
                        </span>
                      ))}
                    </span>
                    <span className="shrink-0 font-bold">{formatMoney(e.amount_cents)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

/** The items charged to customers on one expense, added up per customer. */
function chargesByClient(items: { amount_cents: number; markup_pct: number; charged: boolean; bill_client_id: string | null; clients: { name: string } | null }[]) {
  const map = new Map<string, { name: string; cents: number; allSent: boolean }>();
  for (const it of items) {
    if (!it.bill_client_id) continue;
    const row = map.get(it.bill_client_id) ?? { name: it.clients?.name ?? "Customer", cents: 0, allSent: true };
    row.cents += resaleCents(it.amount_cents, it.markup_pct);
    row.allSent &&= it.charged;
    map.set(it.bill_client_id, row);
  }
  return [...map.values()];
}
