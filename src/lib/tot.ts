import type { SupabaseClient } from "@supabase/supabase-js";
import { computeTotals } from "@/lib/billing";
import { billingType, jobItemParts, rulesOf, TOT_RATE_PCT, type ClientType, type Ticket } from "@/lib/types";

type Row = Ticket & {
  clients: { client_type: ClientType; internal: boolean };
  time_entries: { started_at: string; ended_at: string | null }[];
  ticket_parts: { qty: number; unit_price_cents: number }[];
  expense_items: { amount_cents: number; markup_pct: number }[];
};

export type Tot = { jobsCents: number; feesCents: number; totCents: number };

/**
 * TOT on the money received between two dates: jobs by the day they were marked paid, plus contract fees marked paid.
 * Service calls are paid through the contract fees, and Swiftnet IT's own jobs bring in no money.
 */
export async function totFor(supabase: SupabaseClient, from: string, to: string): Promise<Tot> {
  const [{ data: jobs, error }, { data: fees, error: feesError }] = await Promise.all([
    supabase
      .from("tickets")
      .select("*, clients!inner(client_type, internal), time_entries(started_at, ended_at), ticket_parts(qty, unit_price_cents), expense_items(amount_cents, markup_pct)")
      .eq("status", "paid")
      .gte("paid_on", from)
      .lte("paid_on", to),
    supabase.from("contract_payments").select("amount_cents").gte("paid_on", from).lte("paid_on", to),
  ]);
  if (error || feesError) throw new Error((error ?? feesError)!.message);
  const jobsCents = ((jobs ?? []) as unknown as Row[])
    .filter((t) => !t.clients.internal && (t.is_project || t.clients.client_type !== "contract"))
    .reduce((s, t) => {
      const entries = t.time_entries.map((e) => ({ startedAt: e.started_at, endedAt: e.ended_at }));
      const parts = [...t.ticket_parts.map((p) => ({ qty: Number(p.qty), unitPriceCents: p.unit_price_cents })), ...jobItemParts(t.expense_items)];
      return s + computeTotals(entries, parts, rulesOf(t, billingType(t.clients.client_type, t.is_project))).totalCents;
    }, 0);
  const feesCents = (fees ?? []).reduce((s, p) => s + (p.amount_cents as number), 0);
  return { jobsCents, feesCents, totCents: Math.round(((jobsCents + feesCents) * TOT_RATE_PCT) / 100) };
}

/** The expense a month's approved TOT is recorded as, dated the last day of that month. */
export const TOT_VENDOR = "TOT";
export const TOT_CATEGORY = "Taxes";
