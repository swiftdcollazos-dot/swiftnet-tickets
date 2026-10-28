import type { SupabaseClient } from "@supabase/supabase-js";
import { computeTotals, notBilled } from "@/lib/billing";
import { billingType, recordLabel, rulesOf, type ClientType, type Ticket } from "@/lib/types";

type Row = Ticket & {
  clients: { name: string; client_type: ClientType; internal: boolean };
  time_entries: { started_at: string; ended_at: string | null }[];
  ticket_parts: { qty: number; unit_price_cents: number }[];
};

export type OwedJob = { id: string; number: number; client: string; label: string; status: "completed" | "sent"; date: string; days: number; cents: number };

/** Closed or sent jobs that still have money due, oldest first. Days are counted from the job date. */
export async function moneyOwed(supabase: SupabaseClient, today: string): Promise<OwedJob[]> {
  const { data, error } = await supabase
    .from("tickets")
    .select("*, clients!inner(name, client_type, internal), time_entries(started_at, ended_at), ticket_parts(qty, unit_price_cents)")
    .in("status", ["completed", "sent"])
    .eq("is_estimate", false);
  if (error) throw new Error(error.message);
  const todayMs = Date.parse(`${today}T00:00:00Z`);
  return ((data ?? []) as unknown as Row[])
    .map((t) => {
      const entries = t.time_entries.map((e) => ({ startedAt: e.started_at, endedAt: e.ended_at }));
      const parts = t.ticket_parts.map((p) => ({ qty: Number(p.qty), unitPriceCents: p.unit_price_cents }));
      const totals = computeTotals(entries, parts, rulesOf(t, billingType(t.clients.client_type, t.is_project)), t.deposit_cents);
      return {
        id: t.id,
        number: t.number,
        client: t.clients.name,
        label: recordLabel(t.clients.client_type, t.is_project),
        status: t.status as "completed" | "sent",
        date: t.ticket_date,
        days: Math.max(0, Math.round((todayMs - Date.parse(`${t.ticket_date}T00:00:00Z`)) / 86_400_000)),
        cents: t.clients.internal ? notBilled(totals).balanceDueCents : totals.balanceDueCents,
      };
    })
    .filter((j) => j.cents > 0)
    .sort((a, b) => b.days - a.days || a.number - b.number);
}
