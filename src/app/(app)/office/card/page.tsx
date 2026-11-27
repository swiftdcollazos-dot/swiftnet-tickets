import { redirect } from "next/navigation";
import { Suspense } from "react";
import { requireUser } from "@/lib/supabase/server";
import { permissions } from "@/lib/owner";
import { formatMoney } from "@/lib/billing";
import { formatDate } from "@/lib/time";
import { deleteCardStatement } from "@/app/actions";
import { ConfirmButton } from "@/components/confirm-button";
import { Loading } from "@/components/loading";
import { CategorySelect, StatementForm } from "@/components/card-forms";
import { PAYMENT_CATEGORY, byCategory, monthLabel, possibleDuplicates, type CardLine, type CardStatement } from "@/lib/card";

// Reading an uploaded statement can take a while.
export const maxDuration = 120;

export default function CardUsagePage() {
  return (
    <>
      <h1 className="h1 mb-1">Credit card usage</h1>
      <p className="mb-4 text-sm text-slate-500">Kept separate from Expenses: nothing here is added to expense totals.</p>
      <Suspense fallback={<Loading />}>
        <CardUsage />
      </Suspense>
    </>
  );
}

const BAR: Record<string, string> = {
  "Parts and equipment": "bg-amber-500",
  "Software and subscriptions": "bg-violet-500",
  Travel: "bg-sky-500",
  Fuel: "bg-red-500",
  Shipping: "bg-teal-500",
  "Local purchases": "bg-green-600",
  Other: "bg-slate-400",
};

function LineRow({ l }: { l: CardLine }) {
  return (
    <li className="flex items-start justify-between gap-3 py-1.5 text-sm">
      <span className="min-w-0">
        <span className="block truncate">{l.merchant}</span>
        <span className="flex flex-wrap items-center gap-1 text-xs text-slate-500">
          {formatDate(l.posted_on)}
          {l.notes ? ` · ${l.notes}` : ""}
          <CategorySelect id={l.id} category={l.category} />
        </span>
      </span>
      <span className={`shrink-0 font-semibold tabular-nums ${l.amount_cents < 0 ? "text-green-700" : ""}`}>{formatMoney(l.amount_cents)}</span>
    </li>
  );
}

function Statement({ s, lines, open }: { s: CardStatement; lines: CardLine[]; open: boolean }) {
  const categories = byCategory(lines);
  const payments = lines.filter((l) => l.category === PAYMENT_CATEGORY);
  const flags = possibleDuplicates(lines);
  const spent = categories.reduce((sum, c) => sum + c.cents, 0);
  const top = categories[0]?.cents || 1;
  const usedPct = s.credit_limit_cents ? Math.min(100, Math.round((s.new_balance_cents / s.credit_limit_cents) * 100)) : 0;

  return (
    <details className="card group" open={open}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block font-semibold">{monthLabel(s.statement_month)}</span>
          <span className="block truncate text-sm text-slate-500">
            {s.card_name || "Card"} · statement {formatDate(s.statement_date)}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-lg font-bold">{formatMoney(s.charges_cents)}</span>
          <span className="block text-xs text-slate-500">charged</span>
        </span>
      </summary>

      <div className="mt-3 space-y-4 border-t border-slate-100 pt-3">
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <Stat label="Previous balance" value={formatMoney(s.previous_balance_cents)} />
          <Stat label="Payments and credits" value={formatMoney(s.credits_cents)} tone="text-green-700" />
          <Stat label="New balance" value={formatMoney(s.new_balance_cents)} />
          <Stat label={s.due_date ? `Minimum due ${formatDate(s.due_date)}` : "Minimum due"} value={formatMoney(s.minimum_due_cents)} tone="text-red-700" />
        </div>
        {s.credit_limit_cents > 0 && (
          <div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-indigo-500" style={{ width: `${usedPct}%` }} />
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {usedPct}% of the {formatMoney(s.credit_limit_cents)} limit used · {formatMoney(Math.max(0, s.credit_limit_cents - s.new_balance_cents))} available
            </p>
          </div>
        )}

        {flags.length > 0 && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-semibold">⚠️ Possible duplicate {flags.length === 1 ? "subscription" : "subscriptions"}</p>
            <ul className="mt-1 list-disc pl-5">
              {flags.map((f) => (
                <li key={f.key}>
                  {f.lines.length} charges from {f.key.toUpperCase()}: {f.lines.map((l) => `${formatMoney(l.amount_cents)} on ${formatDate(l.posted_on)}`).join(", ")}
                  {f.differentNames ? " (billed under different merchant names, so they may be two separate accounts)" : ""}
                </li>
              ))}
            </ul>
          </div>
        )}

        <section>
          <h3 className="mb-2 font-semibold">Where it went</h3>
          <ul className="space-y-2">
            {categories.map((c) => (
              <li key={c.category}>
                <details>
                  <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                    <span className="flex items-baseline justify-between gap-2 text-sm">
                      <span>
                        {c.category} <span className="text-slate-500">· {c.count} {c.count === 1 ? "charge" : "charges"}</span>
                      </span>
                      <span className="font-semibold tabular-nums">
                        {formatMoney(c.cents)} <span className="font-normal text-slate-500">({spent ? Math.round((c.cents / spent) * 100) : 0}%)</span>
                      </span>
                    </span>
                    <span className="mt-1 block h-2 overflow-hidden rounded-full bg-slate-100">
                      <span className={`block h-full rounded-full ${BAR[c.category] ?? BAR.Other}`} style={{ width: `${Math.max(2, Math.round((c.cents / top) * 100))}%` }} />
                    </span>
                  </summary>
                  <ul className="mt-1 divide-y divide-slate-100 pl-2">
                    {c.lines.map((l) => <LineRow key={l.id} l={l} />)}
                  </ul>
                </details>
              </li>
            ))}
          </ul>
          {lines.length > 0 && spent !== s.charges_cents && (
            <p className="mt-2 text-xs text-red-700">The lines add up to {formatMoney(spent)}, but the statement says {formatMoney(s.charges_cents)} in charges.</p>
          )}
          <p className="mt-2 text-xs text-slate-500">Tap a category to see its charges. Change a charge&apos;s category with its dropdown.</p>
        </section>

        {payments.length > 0 && (
          <section>
            <h3 className="mb-1 font-semibold">Payments and credits</h3>
            <ul className="divide-y divide-slate-100">
              {payments.map((l) => <LineRow key={l.id} l={l} />)}
            </ul>
          </section>
        )}

        <ConfirmButton action={deleteCardStatement.bind(null, s.id)} question={`Delete the ${monthLabel(s.statement_month)} statement?`} className="btn-danger w-full">
          Delete this statement
        </ConfirmButton>
      </div>
    </details>
  );
}

function Stat({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`font-bold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}

async function CardUsage() {
  const { supabase, user } = await requireUser();
  if (!permissions(user).office) redirect("/dashboard");
  const [{ data: st, error }, { data: tx, error: txError }] = await Promise.all([
    supabase.from("card_statements").select("*").order("statement_month", { ascending: false }),
    supabase.from("card_transactions").select("*").order("posted_on").order("merchant"),
  ]);
  if (error || txError) {
    return (
      <p className="card text-sm text-red-700">
        Credit card usage isn&apos;t set up yet. Run setup/credit-card-usage.sql in Supabase first. ({(error ?? txError)?.message})
      </p>
    );
  }
  const statements = (st ?? []) as CardStatement[];
  const lines = (tx ?? []) as CardLine[];
  const linesFor = (id: string) => lines.filter((l) => l.statement_id === id);

  return (
    <div className="space-y-6">
      {statements.length > 1 && (
        <section className="card overflow-x-auto">
          <h2 className="h2 mb-2">Month by month</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th className="py-1 font-normal">Month</th>
                <th className="py-1 text-right font-normal">Charged</th>
                <th className="py-1 text-right font-normal">Paid</th>
                <th className="py-1 text-right font-normal">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {statements.map((s) => (
                <tr key={s.id}>
                  <td className="py-1.5">{monthLabel(s.statement_month)}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatMoney(s.charges_cents)}</td>
                  <td className="py-1.5 text-right tabular-nums text-green-700">{formatMoney(s.credits_cents)}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatMoney(s.new_balance_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {statements.length === 0 && <p className="card text-center text-slate-500">No statements yet. Add one below.</p>}
      <div className="space-y-3">
        {statements.map((s, i) => <Statement key={s.id} s={s} lines={linesFor(s.id)} open={i === 0} />)}
      </div>

      <details className="card group" open={statements.length === 0}>
        <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between [&::-webkit-details-marker]:hidden">
          <h2 className="h2 mb-0">+ Add a month</h2>
          <span className="text-sm text-slate-500 transition-transform group-open:rotate-180">▼</span>
        </summary>
        <div className="mt-3">
          <StatementForm cardName={statements[0]?.card_name ?? ""} />
        </div>
      </details>
    </div>
  );
}
