import { notFound } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { computeTotals } from "@/lib/billing";
import { rulesOf, type Client, type PartRow, type Settings, type Ticket, type TimeEntryRow } from "@/lib/types";

/** Loads everything needed to show or print one ticket. */
export async function loadTicket(id: string) {
  const { supabase, user } = await requireUser();
  const [ticketRes, settingsRes, profilesRes] = await Promise.all([
    supabase
      .from("tickets")
      .select("*, clients(*), time_entries(*), ticket_parts(*)")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("settings").select("*").single(),
    supabase.from("profiles").select("id, full_name"),
  ]);
  if (ticketRes.error) throw new Error(ticketRes.error.message);
  if (!ticketRes.data) notFound();

  const { clients, time_entries, ticket_parts, ...ticket } = ticketRes.data;
  const entries = (time_entries as TimeEntryRow[]).sort((a, b) => a.started_at.localeCompare(b.started_at));
  const parts = (ticket_parts as PartRow[]).map((p) => ({ ...p, qty: Number(p.qty) }));
  const t = { ...ticket, tax_rate_pct: Number(ticket.tax_rate_pct) } as Ticket;

  const totals = computeTotals(
    entries.map((e) => ({ startedAt: e.started_at, endedAt: e.ended_at })),
    parts.map((p) => ({ qty: p.qty, unitPriceCents: p.unit_price_cents })),
    rulesOf(t),
    t.deposit_cents,
  );

  const names = new Map<string, string>((profilesRes.data ?? []).map((p) => [p.id, p.full_name]));

  return {
    user,
    ticket: t,
    client: clients as Client,
    entries,
    parts,
    totals,
    settings: settingsRes.data as Settings,
    techName: (id: string | null) => (id ? names.get(id) ?? "" : ""),
  };
}
