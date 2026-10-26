import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/lib/supabase/server";
import { isOwner, permissions } from "@/lib/owner";
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
  const owner = isOwner(user.email);

  const params = await searchParams;
  const today = todayLocal();
  const month = typeof params.month === "string" && /^\d{4}-\d{2}$/.test(params.month) ? params.month : today.slice(0, 7);
  const { data, error } = await supabase
    .from("expenses")
    .select("id, spent_on, vendor, category, description, amount_cents, tax_cents, payment_method, created_by, bill_client_id, markup_pct, charged, clients(name)")
    .gte("spent_on", `${month}-01`)
    .lt("spent_on", `${shiftMonth(month, 1)}-01`)
    .order("spent_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  type Row = Omit<Expense, "receipt" | "created_at"> & { created_by: string | null; clients: { name: string } | null };
  const expenses = (data ?? []) as unknown as Row[];
  const { data: clientRows } = await supabase.from("clients").select("id, name").order("name");
  const { data: profiles } = owner ? await supabase.from("profiles").select("id, full_name") : { data: [] };
  const names = new Map((profiles ?? []).map((p) => [p.id as string, p.full_name as string]));
  // Others' expenses get the reporter's name; the owner's own don't.
  const reporter = (id: string | null) => (owner && id && id !== user.id ? names.get(id) : undefined);

  const total = expenses.reduce((sum, e) => sum + e.amount_cents, 0);
  const tax = expenses.reduce((sum, e) => sum + e.tax_cents, 0);
  const byCategory = new Map<string, number>();
  for (const e of expenses) byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amount_cents);
  const categories = [...byCategory].sort((a, b) => b[1] - a[1]);

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

      <div className="flex items-center justify-between">
        <Link href={`/expenses?month=${shiftMonth(month, -1)}`} className="btn-light px-3" aria-label="Previous month">‹</Link>
        <h2 className="h2 mb-0">{monthName(month)}</h2>
        <Link href={`/expenses?month=${shiftMonth(month, 1)}`} className="btn-light px-3" aria-label="Next month">›</Link>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="card">
          <p className="label">{owner ? "Spent" : "You spent"}</p>
          <p className="text-2xl font-bold">{formatMoney(total)}</p>
        </div>
        <div className="card">
          <p className="label">Sales tax paid</p>
          <p className="text-2xl font-bold">{formatMoney(tax)}</p>
        </div>
      </div>


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
        <p className="card text-center text-slate-500">No expenses in {monthName(month)}.</p>
      ) : (
        <ul className="space-y-2">
          {expenses.map((e) => (
            <li key={e.id}>
              <Link href={`/expenses/${e.id}`} className="card flex items-center justify-between gap-3 hover:bg-slate-50">
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{e.vendor}</span>
                  <span className="block truncate text-sm text-slate-500">
                    {reporter(e.created_by) && <span className="font-semibold text-brand">{reporter(e.created_by)} · </span>}
                    {formatDate(e.spent_on)} · {e.category}
                    {e.description ? ` · ${e.description}` : ""}
                  </span>
                  {e.clients && (
                    <span className={`block truncate text-sm font-semibold ${e.charged ? "text-slate-500" : "text-green-700"}`}>
                      {e.charged ? "Sent to" : "Charge"} {e.clients.name} {formatMoney(resaleCents(e.amount_cents, e.markup_pct))} (+{e.markup_pct}%)
                    </span>
                  )}
                </span>
                <span className="shrink-0 font-bold">{formatMoney(e.amount_cents)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
