import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { requireUser } from "@/lib/supabase/server";
import { permissions } from "@/lib/owner";
import { formatMoney } from "@/lib/billing";
import { formatDate, todayLocal } from "@/lib/time";
import { moneyOwed, type OwedJob } from "@/lib/owed";
import { Loading } from "@/components/loading";

export default function MoneyOwedPage() {
  return (
    <>
      <h1 className="h1 mb-4">Money owed</h1>
      <Suspense fallback={<Loading />}>
        <Owed />
      </Suspense>
    </>
  );
}

/** Green under 30 days, amber up to 60, red after that. */
function ageColor(days: number) {
  if (days > 60) return "bg-red-100 text-red-800";
  if (days > 30) return "bg-amber-100 text-amber-800";
  return "bg-green-100 text-green-800";
}

async function Owed() {
  const { supabase, user } = await requireUser();
  if (!permissions(user).office) redirect("/dashboard");
  const jobs = await moneyOwed(supabase, todayLocal());
  const total = jobs.reduce((s, j) => s + j.cents, 0);
  const sent = jobs.filter((j) => j.status === "sent");
  const notSent = jobs.filter((j) => j.status === "completed");
  const sum = (list: OwedJob[]) => list.reduce((s, j) => s + j.cents, 0);

  return (
    <div className="space-y-4">
      <div className="card">
        <p className="label">Total owed</p>
        <p className="text-3xl font-bold">{formatMoney(total)}</p>
        <p className="text-sm text-slate-500">
          {jobs.length} {jobs.length === 1 ? "job" : "jobs"} closed but not marked paid
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="card">
          <p className="label">Not sent yet</p>
          <p className="text-xl font-bold">{formatMoney(sum(notSent))}</p>
          <p className="text-xs text-slate-500">{notSent.length} completed</p>
        </div>
        <div className="card">
          <p className="label">Sent to customer</p>
          <p className="text-xl font-bold">{formatMoney(sum(sent))}</p>
          <p className="text-xs text-slate-500">{sent.length} waiting for payment</p>
        </div>
      </div>

      {jobs.length === 0 ? (
        <p className="card text-center text-slate-500">Nothing owed. Every closed job is paid. 🎉</p>
      ) : (
        <ul className="space-y-2">
          {jobs.map((j) => (
            <li key={j.id}>
              <Link href={`/tickets/${j.id}`} className="card flex items-center justify-between gap-3 hover:bg-slate-50">
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{j.client}</span>
                  <span className="block truncate text-sm text-slate-500">
                    {j.label} #{j.number} · {formatDate(j.date)} · {j.status === "sent" ? "Sent" : "Not sent yet"}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-bold">{formatMoney(j.cents)}</span>
                  <span className={`inline-block rounded-full px-2 text-xs font-semibold ${ageColor(j.days)}`}>
                    {j.days} {j.days === 1 ? "day" : "days"}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-slate-500">Days are counted from the job date. Mark a job as paid on the job itself and it leaves this list.</p>
    </div>
  );
}
