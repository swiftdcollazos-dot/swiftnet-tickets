import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { LiveTimer } from "@/components/live-timer";

type Running = {
  id: string;
  started_at: string;
  tickets: { id: string; number: number; clients: { name: string } | null } | null;
};

/** Every timer that is still running, so you can jump between jobs while their clocks keep going. */
export async function RunningTimers() {
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("time_entries")
    .select("id, started_at, tickets(id, number, clients(name))")
    .is("ended_at", null)
    .order("started_at");
  const running = ((data ?? []) as unknown as Running[]).filter((r) => r.tickets);
  if (running.length === 0) return null;

  return (
    <div className="border-t border-white/20 bg-red-700">
      <div className="mx-auto flex max-w-3xl gap-2 overflow-x-auto px-4 py-2 text-xs font-semibold">
        <span className="shrink-0 self-center text-red-100">● Running:</span>
        {running.map((r) => (
          <Link
            key={r.id}
            href={`/tickets/${r.tickets!.id}`}
            className="flex shrink-0 items-center gap-2 rounded-full bg-white/15 px-3 py-1 hover:bg-white/25"
          >
            <span>#{r.tickets!.number} {r.tickets!.clients?.name}</span>
            <LiveTimer startedAt={r.started_at} />
          </Link>
        ))}
      </div>
    </div>
  );
}
