import type { SupabaseClient } from "@supabase/supabase-js";
import { recordLabel, type ClientType } from "@/lib/types";

export type JobOption = { id: string; client_id: string; label: string };

/** Jobs an expense item can be put on: each customer's open or closed (not yet sent) jobs, plus any already linked. */
export async function jobOptions(supabase: SupabaseClient, linkedIds: string[] = []): Promise<JobOption[]> {
  const select = "id, number, client_id, ticket_date, item_to_service, is_project, clients(client_type)";
  const [{ data: open }, { data: linked }] = await Promise.all([
    supabase.from("tickets").select(select).in("status", ["open", "completed"]).eq("is_estimate", false).order("number", { ascending: false }).limit(300),
    linkedIds.length ? supabase.from("tickets").select(select).in("id", linkedIds) : Promise.resolve({ data: [] }),
  ]);
  type Row = { id: string; number: number; client_id: string; ticket_date: string; item_to_service: string; is_project: boolean; clients: { client_type: ClientType } | null };
  const rows = new Map<string, Row>();
  for (const r of [...((open ?? []) as unknown as Row[]), ...((linked ?? []) as unknown as Row[])]) rows.set(r.id, r);
  return [...rows.values()].map((r) => ({
    id: r.id,
    client_id: r.client_id,
    label: `#${r.number} ${recordLabel(r.clients?.client_type, r.is_project)}${r.item_to_service ? ` · ${r.item_to_service}` : ""}`,
  }));
}
