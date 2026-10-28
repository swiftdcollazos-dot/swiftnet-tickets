import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** How many service tickets, service calls (contract clients) and special projects are still open. */
export async function pendingCounts(supabase: Supabase) {
  // Special projects count whatever the client type.
  const count = async (clientType: "hourly" | "contract" | null, isProject: boolean) => {
    let query = supabase
      .from("tickets")
      .select("id, clients!inner(client_type)", { count: "exact", head: true })
      .eq("status", "open")
      .eq("is_project", isProject)
      // Standing jobs are always open, so they aren't waiting on anyone.
      .eq("repeats", "");
    if (clientType) query = query.eq("clients.client_type", clientType);
    const { count, error } = await query;
    if (error) throw new Error(error.message);
    return count ?? 0;
  };
  const [tickets, calls, projects] = await Promise.all([count("hourly", false), count("contract", false), count(null, true)]);
  return { tickets, calls, projects };
}
