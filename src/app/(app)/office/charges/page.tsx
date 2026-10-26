import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { requireUser } from "@/lib/supabase/server";
import { isOwner } from "@/lib/owner";
import { formatMoney } from "@/lib/billing";
import { formatDate } from "@/lib/time";
import { markChargeSent } from "@/app/actions";
import { Loading } from "@/components/loading";
import { resaleCents } from "@/lib/types";

export default function ChargesPage() {
  return (
    <>
      <h1 className="h1 mb-4">Charge customers</h1>
      <Suspense fallback={<Loading />}>
        <Charges />
      </Suspense>
    </>
  );
}

type Row = {
  id: string;
  spent_on: string;
  vendor: string;
  description: string;
  amount_cents: number;
  markup_pct: number;
  charged: boolean;
  created_by: string | null;
  bill_client_id: string;
  clients: { name: string } | null;
};

async function Charges() {
  const { supabase, user } = await requireUser();
  if (!isOwner(user.email)) redirect("/dashboard");
  const select = "id, spent_on, vendor, description, amount_cents, markup_pct, charged, created_by, bill_client_id, clients(name)";
  const [{ data: toSend, error }, { data: sent }, { data: profiles }] = await Promise.all([
    supabase.from("expenses").select(select).not("bill_client_id", "is", null).eq("charged", false).order("spent_on"),
    supabase.from("expenses").select(select).not("bill_client_id", "is", null).eq("charged", true).order("spent_on", { ascending: false }).limit(50),
    supabase.from("profiles").select("id, full_name"),
  ]);
  if (error) throw new Error(error.message);
  const names = new Map((profiles ?? []).map((p) => [p.id as string, p.full_name as string]));
  const pending = (toSend ?? []) as unknown as Row[];
  const done = (sent ?? []) as unknown as Row[];
  const charge = (r: Row) => resaleCents(r.amount_cents, r.markup_pct);
  const total = pending.reduce((s, r) => s + charge(r), 0);

  // Group what's still to send by customer, so each customer's items can go on one bill.
  const byClient = new Map<string, Row[]>();
  for (const r of pending) byClient.set(r.bill_client_id, [...(byClient.get(r.bill_client_id) ?? []), r]);
  const groups = [...byClient.values()].sort((a, b) => (a[0].clients?.name ?? "").localeCompare(b[0].clients?.name ?? ""));

  const item = (r: Row, showClient = false) => (
    <li key={r.id} className="flex items-center justify-between gap-3 py-2">
      <Link href={`/expenses/${r.id}`} className="min-w-0">
        <span className="block truncate font-semibold">
          {r.vendor}
          {r.description ? ` · ${r.description}` : ""}
        </span>
        <span className="block truncate text-xs text-slate-500">
          {showClient ? `${r.clients?.name} · ` : ""}
          {formatDate(r.spent_on)}
          {r.created_by && r.created_by !== user.id && names.get(r.created_by) ? ` · ${names.get(r.created_by)}` : ""} · cost {formatMoney(r.amount_cents)} + {r.markup_pct}%
        </span>
      </Link>
      <span className="shrink-0 text-right">
        <span className="block font-bold">{formatMoney(charge(r))}</span>
        <form action={markChargeSent.bind(null, r.id, !r.charged)}>
          <button className={r.charged ? "text-xs text-slate-500 underline" : "mt-1 rounded-lg bg-green-600 px-2 py-1 text-xs font-bold text-white"}>
            {r.charged ? "Undo" : "✓ Sent to customer"}
          </button>
        </form>
      </span>
    </li>
  );

  return (
    <div className="space-y-6">
      <div className="card">
        <p className="label">To send to customers</p>
        <p className="text-3xl font-bold">{formatMoney(total)}</p>
        <p className="text-sm text-slate-500">
          {pending.length} {pending.length === 1 ? "item" : "items"} bought for customers, cost plus markup
        </p>
      </div>

      {groups.length === 0 ? (
        <p className="card text-center text-slate-500">Nothing to charge. Items bought for a customer show up here.</p>
      ) : (
        groups.map((rows) => (
          <section key={rows[0].bill_client_id} className="card">
            <h2 className="h2 mb-1 flex justify-between">
              <span>{rows[0].clients?.name}</span>
              <span>{formatMoney(rows.reduce((s, r) => s + charge(r), 0))}</span>
            </h2>
            <ul className="divide-y divide-slate-100">{rows.map((r) => item(r))}</ul>
          </section>
        ))
      )}

      {done.length > 0 && (
        <section>
          <h2 className="h2 mb-2">Sent to customer</h2>
          <div className="card">
            <ul className="divide-y divide-slate-100">
              {done.map((r) => item(r, true))}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}
