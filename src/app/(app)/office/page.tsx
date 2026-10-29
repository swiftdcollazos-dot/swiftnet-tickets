import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { requireUser } from "@/lib/supabase/server";
import { isOwner, permissions } from "@/lib/owner";
import { formatMoney } from "@/lib/billing";
import { todayLocal } from "@/lib/time";
import { moneyOwed } from "@/lib/owed";
import { resaleCents, TOT_RATE_PCT } from "@/lib/types";
import { Loading } from "@/components/loading";
import { ConfirmButton } from "@/components/confirm-button";
import { recordTot } from "@/app/actions";
import { TOT_CATEGORY, TOT_VENDOR, totFor, type Tot } from "@/lib/tot";

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
  if (!permissions(user).office) redirect("/dashboard");
  const today = todayLocal();
  const owner = isOwner(user.email);
  const month = today.slice(0, 7);
  const in30 = new Date(Date.parse(`${today}T00:00:00Z`) + 30 * 86_400_000).toISOString().slice(0, 10);
  const [owed, { data: spent }, { data: due }, { data: toCharge }, { data: contracts }, { data: contractPaid }] = await Promise.all([
    moneyOwed(supabase, today),
    supabase.from("expenses").select("amount_cents").gte("spent_on", `${month}-01`).lt("spent_on", `${nextMonth(month)}-01`),
    supabase.from("renewals").select("due_on").lte("due_on", in30),
    supabase.from("expense_items").select("amount_cents, markup_pct").not("bill_client_id", "is", null).is("ticket_id", null).eq("charged", false),
    supabase.from("clients").select("id, monthly_fee_cents, created_at").eq("client_type", "contract").gt("monthly_fee_cents", 0),
    supabase.from("contract_payments").select("client_id").eq("month", month),
  ]);
  // Contract fees for this month that haven't been marked paid.
  const paidIds = new Set((contractPaid ?? []).map((p) => p.client_id as string));
  const unpaidContracts = (contracts ?? []).filter((c) => String(c.created_at).slice(0, 7) <= month && !paidIds.has(c.id as string));
  const unpaidFees = unpaidContracts.reduce((s, c) => s + (c.monthly_fee_cents as number), 0);
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
      <Link href="/office/contracts" className="card block border-l-4 border-l-red-500 hover:bg-slate-50">
        <p className="label">📄 Contract payments</p>
        <p className="text-3xl font-bold">{formatMoney(unpaidFees)}</p>
        <p className="text-sm text-slate-500">
          {unpaidContracts.length} {unpaidContracts.length === 1 ? "contract" : "contracts"} not paid this month
        </p>
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
      {owner && <TotTile today={today} />}
    </div>
  );
}

const monthName = (first: string) => new Date(`${first}T00:00:00Z`).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const lastDay = (first: string) => {
  const [y, m] = first.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

/** TOT so far this month, and last month's to approve: it's paid after the month is done. */
async function TotTile({ today }: { today: string }) {
  const { supabase } = await requireUser();
  const thisStart = `${today.slice(0, 7)}-01`;
  const [y, m] = today.split("-").map(Number);
  const lastStart = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10);
  const lastEnd = lastDay(lastStart);
  let now: Tot, last: Tot;
  try {
    [now, last] = await Promise.all([totFor(supabase, thisStart, today), totFor(supabase, lastStart, lastEnd)]);
  } catch (e) {
    return (
      <div className="card border-l-4 border-l-orange-500 sm:col-span-2">
        <p className="label">🧮 TOT ({TOT_RATE_PCT}%)</p>
        <p className="text-sm text-red-700">The TOT couldn&apos;t be worked out: {e instanceof Error ? e.message : String(e)}</p>
      </div>
    );
  }
  const { data: recorded } = await supabase
    .from("expenses")
    .select("amount_cents")
    .eq("vendor", TOT_VENDOR)
    .eq("category", TOT_CATEGORY)
    .eq("spent_on", lastEnd)
    .maybeSingle();
  const lastName = monthName(lastStart);
  return (
    <div className="card border-l-4 border-l-orange-500 sm:col-span-2">
      <p className="label">🧮 TOT ({TOT_RATE_PCT}%)</p>
      <p className="text-3xl font-bold">{formatMoney(now.totCents)}</p>
      <p className="text-sm text-slate-500">
        so far in {monthName(thisStart)}, on {formatMoney(now.jobsCents + now.feesCents)} received ({formatMoney(now.jobsCents)} paid jobs + {formatMoney(now.feesCents)} contract fees)
      </p>
      <div className="mt-3 border-t border-slate-200 pt-3">
        <p className="text-sm">
          {lastName}: <span className="font-bold">{formatMoney(last.totCents)}</span>{" "}
          <span className="text-slate-500">on {formatMoney(last.jobsCents + last.feesCents)} received</span>
        </p>
        {!recorded && last.totCents === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Nothing to pay for {lastName}.</p>
        ) : recorded && recorded.amount_cents === last.totCents ? (
          <p className="mt-2 text-sm font-semibold text-green-700">✓ Approved and recorded in {lastName} expenses</p>
        ) : (
          <div className="mt-2">
            <ConfirmButton action={recordTot.bind(null, lastStart)} question={`Record ${formatMoney(last.totCents)} TOT in ${lastName} expenses?`} className="btn w-full">
              {recorded
                ? `Update recorded TOT (${formatMoney(recorded.amount_cents as number)} → ${formatMoney(last.totCents)})`
                : `Approve ${formatMoney(last.totCents)} and add to ${lastName} expenses`}
            </ConfirmButton>
          </div>
        )}
      </div>
    </div>
  );
}
