import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** How many service tickets, service calls (contract clients) and special projects are still open. */
export async function pendingCounts(supabase: Supabase) {
  const count = async (clientType: "hourly" | "contract", isProject: boolean) => {
    const { count, error } = await supabase
      .from("tickets")
      .select("id, clients!inner(client_type)", { count: "exact", head: true })
      .eq("status", "open")
      .eq("clients.client_type", clientType)
      .eq("is_project", isProject);
    if (error) throw new Error(error.message);
    return count ?? 0;
  };
  const [tickets, calls, projects] = await Promise.all([count("hourly", false), count("contract", false), count("hourly", true)]);
  return { tickets, calls, projects };
}
