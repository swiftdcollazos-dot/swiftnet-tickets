import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { requireUser } from "@/lib/supabase/server";
import { permissions } from "@/lib/owner";
import { formatMoney } from "@/lib/billing";
import { formatDate, todayLocal } from "@/lib/time";
import { setContractPaid } from "@/app/actions";
import { Loading } from "@/components/loading";

export default function ContractsPage(props: PageProps<"/office/contracts">) {
  return (
    <>
      <h1 className="h1 mb-4">Contract payments</h1>
      <Suspense fallback={<Loading />}>
        <Contracts searchParams={props.searchParams} />
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

async function Contracts({ searchParams }: { searchParams: PageProps<"/office/contracts">["searchParams"] }) {
  const { supabase, user } = await requireUser();
  if (!permissions(user).office) redirect("/dashboard");
  const params = await searchParams;
  const month = typeof params.month === "string" && /^\d{4}-\d{2}$/.test(params.month) ? params.month : todayLocal().slice(0, 7);

  const [{ data: clients, error }, { data: payments }] = await Promise.all([
    supabase.from("clients").select("id, name, monthly_fee_cents, created_at").eq("client_type", "contract").gt("monthly_fee_cents", 0).order("name"),
    supabase.from("contract_payments").select("client_id, amount_cents, paid_on").eq("month", month),
  ]);
  if (error) throw new Error(error.message);
  const paidBy = new Map((payments ?? []).map((p) => [p.client_id as string, p as { amount_cents: number; paid_on: string }]));
  // Only clients that were already on contract that month.
  const rows = (clients ?? [])
    .filter((c) => String(c.created_at).slice(0, 7) <= month)
    .map((c) => ({ id: c.id as string, name: c.name as string, fee: c.monthly_fee_cents as number, paid: paidBy.get(c.id as string) }));
  const paid = rows.filter((r) => r.paid);
  const unpaid = rows.filter((r) => !r.paid);
  const sum = (list: typeof rows) => list.reduce((s, r) => s + (r.paid?.amount_cents ?? r.fee), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link href={`/office/contracts?month=${shiftMonth(month, -1)}`} className="btn-light px-3" aria-label="Previous month">‹</Link>
        <h2 className="h2 mb-0">{monthName(month)}</h2>
        <Link href={`/office/contracts?month=${shiftMonth(month, 1)}`} className="btn-light px-3" aria-label="Next month">›</Link>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="card">
          <p className="label">Paid</p>
          <p className="text-2xl font-bold text-green-700">{formatMoney(sum(paid))}</p>
          <p className="text-xs text-slate-500">{paid.length} of {rows.length} contracts</p>
        </div>
        <div className="card">
          <p className="label">Not paid yet</p>
          <p className={`text-2xl font-bold ${unpaid.length ? "text-red-600" : ""}`}>{formatMoney(sum(unpaid))}</p>
          <p className="text-xs text-slate-500">{unpaid.length} {unpaid.length === 1 ? "contract" : "contracts"}</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="card text-center text-slate-500">No contract clients with a monthly fee.</p>
      ) : (
        <ul className="card divide-y divide-slate-100">
          {[...unpaid, ...paid].map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
              <span className="min-w-0">
                <span className="block truncate font-semibold">{r.name}</span>
                <span className="block text-xs text-slate-500">
                  {formatMoney(r.paid?.amount_cents ?? r.fee)} / month
                  {r.paid ? ` · paid ${formatDate(r.paid.paid_on)}` : ""}
                </span>
              </span>
              <form action={setContractPaid.bind(null, r.id, month, r.fee, !r.paid)}>
                <button
                  className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-bold ${r.paid ? "bg-green-100 text-green-800" : "border border-slate-300 bg-white text-slate-700"}`}
                >
                  {r.paid ? "✓ Paid" : "Mark paid"}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-slate-500">Tap ✓ Paid again to undo. The fee comes from the client&apos;s monthly fee in Clients.</p>
    </div>
  );
}
