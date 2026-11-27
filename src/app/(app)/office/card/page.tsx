import { redirect } from "next/navigation";
import { Suspense } from "react";
import { requireUser } from "@/lib/supabase/server";
import { permissions } from "@/lib/owner";
import { formatMoney } from "@/lib/billing";
import { formatDate } from "@/lib/time";
import { deleteCardStatement } from "@/app/actions";
import { ConfirmButton } from "@/components/confirm-button";
import { Loading } from "@/components/loading";
import { AddStatementButton, CategorySelect, StatementForm } from "@/components/card-forms";
import { type Warning, type WarningKind, PAYMENT_CATEGORY, byCategory, estimateMiles, statementWarnings, learnFrom, type Learned, monthLabel, type CardLine, type CardStatement } from "@/lib/card";

// Reading an uploaded statement can take a while.
export const maxDuration = 120;

export default function CardUsagePage() {
  return (
    <>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="h1 mb-1">Credit card usage</h1>
          <p className="text-sm text-slate-500">Kept separate from Expenses: nothing here is added to expense totals.</p>
        </div>
        <AddStatementButton />
      </div>
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
  "Company lunch": "bg-orange-500",
  "Company dinner": "bg-rose-600",
  Entertainment: "bg-pink-500",
  "Customer incentives": "bg-cyan-600",
  "Research and development": "bg-lime-600",
  "Government taxes": "bg-stone-600",
  "Health insurance": "bg-emerald-600",
  "Car insurance": "bg-indigo-400",
  "Automobile parts": "bg-zinc-500",
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

function Statement({ s, lines, learned, otherMonths }: { s: CardStatement; lines: CardLine[]; learned: Learned; otherMonths: number[] }) {
  const categories = byCategory(lines);
  const payments = lines.filter((l) => l.category === PAYMENT_CATEGORY);
  const warnings = statementWarnings(s, lines, otherMonths);
  const spent = categories.reduce((sum, c) => sum + c.cents, 0);
  const top = categories[0]?.cents || 1;
  const usedPct = s.credit_limit_cents ? Math.min(100, Math.round((s.new_balance_cents / s.credit_limit_cents) * 100)) : 0;

  return (
    <details className="card group">
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
       <span className="flex items-center justify-between gap-3">
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
       </span>
        {/* What to review, shown even while the month is collapsed: a short badge each, details on hover. */}
        <WarningBadges warnings={warnings} />
        <span className="mt-2 block text-xs text-slate-500 group-open:hidden">Tap to see the charges ▼</span>
      </summary>

      <div className="mt-3 space-y-4 border-t border-slate-100 pt-3">
        <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <Stat label="Previous balance" value={formatMoney(s.previous_balance_cents)} />
          <Stat label="Payments and credits" value={formatMoney(s.credits_cents)} tone="text-green-700" />
          <Stat label="New balance" value={formatMoney(s.new_balance_cents)} />
          <Stat label={s.due_date ? `Minimum due ${formatDate(s.due_date)}` : "Minimum due"} value={formatMoney(s.minimum_due_cents)} tone="text-red-700" />
        </div>
        <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
          <p>
            ✈️ <span className="font-semibold">About {estimateMiles(s.charges_cents).toLocaleString("en-US")} AAdvantage miles</span> from this month&apos;s{" "}
            {formatMoney(s.charges_cents)} in charges (1 mile per $1). The bank confirms them on next month&apos;s statement.
          </p>
          <p className="mt-1 text-sky-800">
            {s.miles_earned != null
              ? `Printed on this statement: ${s.miles_earned.toLocaleString("en-US")} miles, earned on the statement before.`
              : "Miles printed on this statement: not recorded. Add them with ✏️ Edit this statement."}
          </p>
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

        <details className="rounded-lg border border-slate-200 p-3">
          <summary className="cursor-pointer font-semibold">✏️ Edit this statement</summary>
          <p className="mt-1 text-xs text-slate-500">Change the totals, any line or its category, add or remove lines, or upload the PDF again to re-read it.</p>
          <div className="mt-3">
            <StatementForm cardName={s.card_name} edit={{ statement: s, lines }} learned={learned} />
          </div>
        </details>

        <ConfirmButton action={deleteCardStatement.bind(null, s.id)} question={`Delete the ${monthLabel(s.statement_month)} statement?`} className="btn-danger w-full">
          Delete this statement
        </ConfirmButton>
      </div>
    </details>
  );
}

// Simple line icons (24×24, stroke), one per kind of warning.
const ICON: Record<WarningKind | "ok", string> = {
  math: "M4 4h16v16H4z M8 9h8 M8 15h8 M12 7v4",
  double: "M8 8h11v11H8z M5 16V5h11",
  subscription: "M4 12a8 8 0 0 1 14-5.3L20 9 M20 4v5h-5 M20 12a8 8 0 0 1-14 5.3L4 15 M4 20v-5h5",
  fee: "M12 3v18 M17 7.5c0-1.9-2.2-3-5-3s-5 1.1-5 3 2.2 2.6 5 3.5 5 1.6 5 3.5-2.2 3-5 3-5-1.1-5-3",
  foreign: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18 M3 12h18 M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3",
  large: "M12 3v15 M6 12l6 6 6-6 M5 21h14",
  uncategorized: "M3 12V4h8l10 10-8 8z M7.5 7.5h.01",
  spending: "M3 17l6-6 4 4 8-8 M15 7h6v6",
  limit: "M12 4L2 20h20z M12 10v4 M12 17h.01",
  empty: "M6 3h9l4 4v14H6z M14 3v5h5",
  ok: "M5 12l5 5 9-10",
};

function Icon({ kind, className }: { kind: WarningKind | "ok"; className: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d={ICON[kind]} />
    </svg>
  );
}

function WarningBadges({ warnings }: { warnings: Warning[] }) {
  if (warnings.length === 0) {
    return (
      <span className="mt-2 inline-flex items-center gap-1.5 text-sm text-slate-500">
        <Icon kind="ok" className="h-4 w-4 text-emerald-600" /> Nothing strange
      </span>
    );
  }
  return (
    <span className="mt-3 flex flex-wrap gap-1.5">
      {warnings.map((w, i) => (
        <span
          key={i}
          tabIndex={0}
          className="group/w relative inline-flex max-w-full items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-slate-300 hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
        >
          <Icon kind={w.kind} className={`h-3.5 w-3.5 shrink-0 ${w.level === "alert" ? "text-red-600" : "text-amber-600"}`} />
          <span className="truncate">{w.label}</span>
          {/* The full detail, on hover or keyboard focus. */}
          <span
            role="tooltip"
            className="pointer-events-none absolute left-0 top-full z-20 mt-1.5 hidden w-72 max-w-[80vw] rounded-lg bg-slate-800 px-3 py-2 text-xs font-normal leading-relaxed text-white shadow-lg group-hover/w:block group-focus/w:block"
          >
            <span className={`mb-0.5 block font-semibold ${w.level === "alert" ? "text-red-300" : "text-amber-300"}`}>
              {w.level === "alert" ? "Needs attention" : "Worth a look"}
            </span>
            {w.text}
          </span>
        </span>
      ))}
    </span>
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
    supabase.from("card_statements").select("*").order("statement_month") /* January at the top, down to December */,
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
  const learned = learnFrom(lines);
  const linesFor = (id: string) => lines.filter((l) => l.statement_id === id);

  return (
    <div className="space-y-6">
      <details id="add-month" className="card group scroll-mt-4 [&:not([open])]:hidden" open={statements.length === 0}>
        <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between [&::-webkit-details-marker]:hidden">
          <h2 className="h2 mb-0">Add a statement</h2>
          <span className="text-sm text-slate-500" aria-label="Close">✕</span>
        </summary>
        <div className="mt-3">
          <StatementForm cardName={statements.at(-1)?.card_name ?? ""} learned={learned} />
        </div>
      </details>
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
                <th className="py-1 text-right font-normal">Miles</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {statements.map((s) => (
                <tr key={s.id}>
                  <td className="py-1.5">{monthLabel(s.statement_month)}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatMoney(s.charges_cents)}</td>
                  <td className="py-1.5 text-right tabular-nums text-green-700">{formatMoney(s.credits_cents)}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatMoney(s.new_balance_cents)}</td>
                  <td className="py-1.5 text-right tabular-nums">{s.miles_earned != null ? s.miles_earned.toLocaleString("en-US") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {statements.length === 0 && <p className="card text-center text-slate-500">No statements yet. Add one below.</p>}
      <div className="space-y-3">
        {statements.map((s) => (
          <Statement key={s.id} s={s} lines={linesFor(s.id)} learned={learned} otherMonths={statements.filter((o) => o.id !== s.id).map((o) => o.charges_cents)} />
        ))}
      </div>

    </div>
  );
}
