import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/lib/supabase/server";
import { permissions } from "@/lib/owner";
import { redirect } from "next/navigation";
import { formatMoney } from "@/lib/billing";
import { formatDate, todayLocal } from "@/lib/time";
import { saveExpense, setExpensePaid } from "@/app/actions";
import { ExpenseForm } from "@/components/expense-form";
import { jobOptions } from "@/lib/job-options";
import { Loading } from "@/components/loading";
import { PAID_DIRECT_METHODS, PAYMENT_COLORS, PAYMENT_METHODS, resaleCents, type Expense } from "@/lib/types";

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
    .select("id, spent_on, vendor, category, description, amount_cents, tax_cents, payment_method, vehicle, created_by, paid_on, expense_items(amount_cents, markup_pct, charged, bill_client_id, ticket_id, clients(name), tickets(number))")
    .order("spent_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (!all) query = query.gte("spent_on", `${month}-01`).lt("spent_on", `${shiftMonth(month, 1)}-01`);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  type Charge = { amount_cents: number; markup_pct: number; charged: boolean; bill_client_id: string | null; ticket_id: string | null; clients: { name: string } | null; tickets: { number: number } | null };
  type Row = Omit<Expense, "receipt" | "card_slip" | "created_at"> & { created_by: string | null; expense_items: Charge[] };
  const expenses = (data ?? []) as unknown as Row[];
  const [{ data: clientRows }, jobs] = await Promise.all([supabase.from("clients").select("id, name").order("name"), jobOptions(supabase)]);
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
          <ExpenseForm today={today} clients={clientRows ?? []} jobs={jobs} save={saveExpense.bind(null, null)} />
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
            {byPaymentMethod(rows).map(([method, group]) => (
              <div key={method} className="space-y-2">
                <div className="flex items-center justify-between gap-2 pt-1">
                  <span className={`rounded-full px-2.5 py-0.5 text-sm font-semibold ring-1 ${PAYMENT_COLORS[method] ?? "bg-slate-100 text-slate-700 ring-slate-300"}`}>
                    {method || "No payment method"}
                  </span>
                  <span className="text-sm text-slate-600">
                    {group.length} · <span className="font-semibold">{formatMoney(group.reduce((sum, e) => sum + e.amount_cents, 0))}</span>
                  </span>
                </div>
                <ul className="space-y-2">
                  {group.map((e) => {
                    const payable = PAID_DIRECT_METHODS.includes(e.payment_method);
                    return (
                    <li key={e.id}>
                      <Link href={`/expenses/${e.id}`} className={`card flex items-center justify-between gap-3 hover:bg-slate-50 ${payable ? "rounded-b-none" : ""}`}>
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{e.vendor}</span>
                          <span className="block truncate text-sm text-slate-500">
                            {reporter(e.created_by) && <span className="font-semibold text-brand">{reporter(e.created_by)} · </span>}
                            {formatDate(e.spent_on)} · {e.category}
                            {e.vehicle ? ` (${e.vehicle})` : ""}
                            {e.description ? ` · ${e.description}` : ""}
                          </span>
                          {chargesByClient(e.expense_items).map((c) => (
                            <span key={`${c.name}${c.job}`} className={`block truncate text-sm font-semibold ${c.allSent || c.job ? "text-slate-500" : "text-green-700"}`}>
                              {c.job ? `On job #${c.job} for` : c.allSent ? "Sent to" : "Charge"} {c.name} {formatMoney(c.cents)}
                            </span>
                          ))}
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-1">
                          <span className="font-bold">{formatMoney(e.amount_cents)}</span>
                          {e.payment_method && (
                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${PAYMENT_COLORS[e.payment_method] ?? "bg-slate-100 text-slate-700 ring-slate-300"}`}>
                              {e.payment_method}
                            </span>
                          )}
                        </span>
                      </Link>
                      {payable && (
                        // Tick to record that this was paid; tap again to undo.
                        <form action={setExpensePaid.bind(null, e.id, !e.paid_on)}>
                          <button
                            className={`flex w-full items-center gap-2 rounded-b-xl border border-t-0 px-4 py-2 text-left text-sm font-semibold ${e.paid_on ? "border-green-300 bg-green-50 text-green-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
                          >
                            <span className={`flex h-5 w-5 items-center justify-center rounded border-2 text-xs ${e.paid_on ? "border-green-600 bg-green-600 text-white" : "border-slate-400 bg-white"}`}>{e.paid_on ? "✓" : ""}</span>
                            {e.paid_on ? `Paid ${formatDate(e.paid_on)}` : "Mark as paid"}
                          </button>
                        </form>
                      )}
                    </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </section>
        ))
      )}
    </div>
  );
}

/** Expenses split by how they were paid, in the order the payment methods are listed on the form; others after, then ones with none. */
function byPaymentMethod<T extends { payment_method: string | null }>(rows: T[]): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const e of rows) groups.set(e.payment_method ?? "", [...(groups.get(e.payment_method ?? "") ?? []), e]);
  const rank = (m: string) => {
    const i = (PAYMENT_METHODS as readonly string[]).indexOf(m);
    return i >= 0 ? i : m ? PAYMENT_METHODS.length : PAYMENT_METHODS.length + 1;
  };
  return [...groups].sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]));
}

/** The items charged to customers on one expense, added up per customer, or per job when put on one. */
function chargesByClient(
  items: { amount_cents: number; markup_pct: number; charged: boolean; bill_client_id: string | null; clients: { name: string } | null; tickets: { number: number } | null }[],
) {
  const map = new Map<string, { name: string; cents: number; allSent: boolean; job: number | null }>();
  for (const it of items) {
    if (!it.bill_client_id) continue;
    const job = it.tickets?.number ?? null;
    const key = `${it.bill_client_id}:${job ?? ""}`;
    const row = map.get(key) ?? { name: it.clients?.name ?? "Customer", cents: 0, allSent: true, job };
    row.cents += resaleCents(it.amount_cents, it.markup_pct);
    row.allSent &&= it.charged;
    map.set(key, row);
  }
  return [...map.values()];
}
