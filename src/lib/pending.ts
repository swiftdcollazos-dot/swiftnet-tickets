import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** How many service tickets (hourly clients) and service calls (contract clients) are still open. */
export async function pendingCounts(supabase: Supabase) {
  const count = async (clientType: "hourly" | "contract") => {
    const { count, error } = await supabase
      .from("tickets")
      .select("id, clients!inner(client_type)", { count: "exact", head: true })
      .eq("status", "open")
      .eq("clients.client_type", clientType);
    if (error) throw new Error(error.message);
    return count ?? 0;
  };
  const [tickets, calls] = await Promise.all([count("hourly"), count("contract")]);
  return { tickets, calls };
}
