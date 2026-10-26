import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { requireUser } from "@/lib/supabase/server";
import { isOwner } from "@/lib/owner";
import { formatMoney } from "@/lib/billing";
import { todayLocal } from "@/lib/time";
import { moneyOwed } from "@/lib/owed";
import { resaleCents } from "@/lib/types";
import { Loading } from "@/components/loading";

export default function OfficePage() {
  return (
    <>
      <h1 className="h1 mb-4">Office</h1>
      <Suspense fallback={<Loading />}>
        <Office />
      </Suspense>
    </>
  );
}

function nextMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
}

async function Office() {
  const { supabase, user } = await requireUser();
  if (!isOwner(user.email)) redirect("/dashboard");
  const today = todayLocal();
  const month = today.slice(0, 7);
  const in30 = new Date(Date.parse(`${today}T00:00:00Z`) + 30 * 86_400_000).toISOString().slice(0, 10);
  const [owed, { data: spent }, { data: due }, { data: toCharge }] = await Promise.all([
    moneyOwed(supabase, today),
    supabase.from("expenses").select("amount_cents").gte("spent_on", `${month}-01`).lt("spent_on", `${nextMonth(month)}-01`),
    supabase.from("renewals").select("due_on").lte("due_on", in30),
    supabase.from("expenses").select("amount_cents, markup_pct").not("bill_client_id", "is", null).eq("charged", false),
  ]);
  const chargeTotal = (toCharge ?? []).reduce((s, e) => s + resaleCents(e.amount_cents as number, e.markup_pct as number), 0);
  const overdue = (due ?? []).filter((r) => (r.due_on as string) < today).length;
  const owedTotal = owed.reduce((s, j) => s + j.cents, 0);
  const oldest = owed[0]?.days ?? 0;
  const spentTotal = (spent ?? []).reduce((s, e) => s + (e.amount_cents as number), 0);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Link href="/office/owed" className="card block border-l-4 border-l-amber-500 hover:bg-slate-50">
        <p className="label">💵 Money owed</p>
        <p className="text-3xl font-bold">{formatMoney(owedTotal)}</p>
        <p className="text-sm text-slate-500">
          {owed.length} unpaid {owed.length === 1 ? "job" : "jobs"}
          {owed.length > 0 ? ` · oldest ${oldest} days` : ""}
        </p>
      </Link>
      <Link href="/expenses" className="card block border-l-4 border-l-violet-500 hover:bg-slate-50">
        <p className="label">🧾 Expenses</p>
        <p className="text-3xl font-bold">{formatMoney(spentTotal)}</p>
        <p className="text-sm text-slate-500">spent this month · scan a receipt</p>
      </Link>
      <Link href="/office/charges" className="card block border-l-4 border-l-green-600 hover:bg-slate-50">
        <p className="label">🛒 Charge customers</p>
        <p className="text-3xl font-bold">{formatMoney(chargeTotal)}</p>
        <p className="text-sm text-slate-500">
          {(toCharge ?? []).length} {(toCharge ?? []).length === 1 ? "item" : "items"} bought for customers, not sent yet
        </p>
      </Link>
      <Link href="/office/renewals" className="card block border-l-4 border-l-blue-500 hover:bg-slate-50">
        <p className="label">🔔 Renewals</p>
        <p className="text-3xl font-bold">{(due ?? []).length}</p>
        <p className={`text-sm ${overdue ? "font-semibold text-red-600" : "text-slate-500"}`}>
          due in the next 30 days{overdue ? ` · ${overdue} overdue` : ""}
        </p>
      </Link>
    </div>
  );
}
