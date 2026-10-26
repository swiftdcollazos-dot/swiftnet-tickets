import { redirect } from "next/navigation";
import { Suspense } from "react";
import { requireUser } from "@/lib/supabase/server";
import { permissions } from "@/lib/owner";
import { formatMoney } from "@/lib/billing";
import { formatDate, todayLocal } from "@/lib/time";
import { deleteRenewal, markRenewed, saveRenewal } from "@/app/actions";
import { ConfirmButton } from "@/components/confirm-button";
import { Loading } from "@/components/loading";
import { RENEWAL_KINDS, RENEWAL_REPEATS, type Renewal } from "@/lib/types";

export default function RenewalsPage() {
  return (
    <>
      <h1 className="h1 mb-4">Renewals</h1>
      <Suspense fallback={<Loading />}>
        <Renewals />
      </Suspense>
    </>
  );
}

type Client = { id: string; name: string };
type Row = Renewal & { clients: { name: string } | null };

/** Days from today to a "YYYY-MM-DD" date; negative when it's past. */
function daysUntil(date: string, today: string): number {
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

function dueText(days: number) {
  if (days < 0) return `${-days} ${days === -1 ? "day" : "days"} overdue`;
  if (days === 0) return "Due today";
  return `In ${days} ${days === 1 ? "day" : "days"}`;
}

function dueColor(days: number) {
  if (days < 0) return "bg-red-100 text-red-800";
  if (days <= 7) return "bg-amber-100 text-amber-800";
  if (days <= 30) return "bg-blue-100 text-blue-800";
  return "bg-slate-100 text-slate-600";
}

function Fields({ id, clients, r }: { id: string; clients: Client[]; r?: Renewal }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="col-span-2">
        <label className="label" htmlFor={`client-${id}`}>Client</label>
        <select className="input" id={`client-${id}`} name="client_id" defaultValue={r?.client_id ?? ""}>
          <option value="">Swiftnet (our own)</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor={`kind-${id}`}>Type</label>
        <select className="input" id={`kind-${id}`} name="kind" defaultValue={r?.kind ?? RENEWAL_KINDS[0]}>
          {RENEWAL_KINDS.map((k) => (
            <option key={k}>{k}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor={`due-${id}`}>Due date</label>
        <input className="input" type="date" id={`due-${id}`} name="due_on" defaultValue={r?.due_on} required />
      </div>
      <div className="col-span-2">
        <label className="label" htmlFor={`name-${id}`}>What renews</label>
        <input className="input" id={`name-${id}`} name="name" defaultValue={r?.name} placeholder="e.g. clientsite.com, Microsoft 365 (10 users), Dell server warranty" required />
      </div>
      <div>
        <label className="label" htmlFor={`repeat-${id}`}>Repeats</label>
        <select className="input" id={`repeat-${id}`} name="repeat_months" defaultValue={String(r?.repeat_months ?? 12)}>
          {RENEWAL_REPEATS.map(([m, label]) => (
            <option key={m} value={m}>{label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor={`cost-${id}`}>Cost ($)</label>
        <input className="input" inputMode="decimal" id={`cost-${id}`} name="cost" defaultValue={r?.cost_cents ? (r.cost_cents / 100).toFixed(2) : ""} />
      </div>
      <div className="col-span-2">
        <label className="label" htmlFor={`notes-${id}`}>Notes</label>
        <input className="input" id={`notes-${id}`} name="notes" defaultValue={r?.notes} placeholder="Where it's registered, account, license key location…" />
      </div>
    </div>
  );
}

async function Renewals() {
  const { supabase, user } = await requireUser();
  if (!permissions(user).office) redirect("/dashboard");
  const today = todayLocal();
  const [{ data, error }, { data: clientRows }] = await Promise.all([
    supabase.from("renewals").select("*, clients(name)").order("due_on"),
    supabase.from("clients").select("id, name").order("name"),
  ]);
  if (error) throw new Error(error.message);
  const rows = ((data ?? []) as Row[]).map((r) => ({ ...r, days: daysUntil(r.due_on, today) }));
  const clients = (clientRows ?? []) as Client[];
  const soon = rows.filter((r) => r.days <= 30);
  const later = rows.filter((r) => r.days > 30);
  const soonCost = soon.reduce((s, r) => s + r.cost_cents, 0);

  const list = (items: typeof rows) => (
    <ul className="space-y-2">
      {items.map((r) => (
        <li key={r.id} className="card">
          <details>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
              <span className="min-w-0">
                <span className="block truncate font-semibold">{r.name}</span>
                <span className="block truncate text-sm text-slate-500">
                  {r.clients?.name ?? "Swiftnet"} · {r.kind} · {formatDate(r.due_on)}
                  {r.cost_cents ? ` · ${formatMoney(r.cost_cents)}` : ""}
                </span>
              </span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${dueColor(r.days)}`}>{dueText(r.days)}</span>
            </summary>
            <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
              {r.notes && <p className="text-sm text-slate-600">{r.notes}</p>}
              <form action={markRenewed.bind(null, r.id)}>
                <button className="btn w-full">
                  ✓ Renewed{r.repeat_months > 0 ? ": move to next date" : ": remove it"}
                </button>
              </form>
              <form action={saveRenewal.bind(null, r.id)} className="space-y-2">
                <Fields id={r.id} clients={clients} r={r} />
                <button className="btn-light w-full">Save changes</button>
              </form>
              <ConfirmButton action={deleteRenewal.bind(null, r.id)} question={`Delete "${r.name}"?`} className="btn-danger w-full">
                Delete
              </ConfirmButton>
            </div>
          </details>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="space-y-6">
      <details className="card group" open={rows.length === 0}>
        <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between [&::-webkit-details-marker]:hidden">
          <h2 className="h2 mb-0">+ Add renewal</h2>
          <span className="text-sm text-slate-500 transition-transform group-open:rotate-180">▼</span>
        </summary>
        <form action={saveRenewal.bind(null, null)} className="mt-3 space-y-3">
          <Fields id="new" clients={clients} />
          <button className="btn w-full">Add renewal</button>
        </form>
      </details>

      <section>
        <h2 className="h2 mb-2">
          Due in the next 30 days ({soon.length}){soonCost ? ` · ${formatMoney(soonCost)}` : ""}
        </h2>
        {soon.length === 0 ? <p className="card text-center text-slate-500">Nothing due in the next 30 days.</p> : list(soon)}
      </section>

      {later.length > 0 && (
        <section>
          <h2 className="h2 mb-2">Later ({later.length})</h2>
          {list(later)}
        </section>
      )}
      <p className="text-xs text-slate-500">Tap an item to edit it or mark it renewed. Renewed moves the date forward by its repeat.</p>
    </div>
  );
}
