import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { LiveTimer } from "@/components/live-timer";

type Running = {
  id: string;
  started_at: string;
  profiles: { full_name: string | null } | null;
  tickets: { id: string; number: number; clients: { name: string } | null } | null;
};

/** "Golf Hourly Co" → "GHC": the first letter or digit of each word, to keep the bar short. */
function initials(name: string) {
  return (name.match(/[\p{L}\p{N}]+/gu) ?? []).map((w) => w[0].toUpperCase()).join("");
}

/** Every timer that is still running, so you can jump between jobs while their clocks keep going. */
export async function RunningTimers() {
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("time_entries")
    .select("id, started_at, profiles(full_name), tickets(id, number, clients(name))")
    .is("ended_at", null)
    .order("started_at");
  const running = ((data ?? []) as unknown as Running[]).filter((r) => r.tickets);
  if (running.length === 0) return null;

  return (
    <div className="border-t border-white/20 bg-red-700">
      {/* Wraps onto more lines so every running timer is visible, on phones and computers alike. */}
      <div className="mx-auto flex max-w-3xl flex-wrap gap-2 px-4 py-2 text-xs font-semibold">
        <span className="shrink-0 self-center text-red-100">● Running:</span>
        {running.map((r) => (
          <Link
            key={r.id}
            href={`/tickets/${r.tickets!.id}`}
            title={r.tickets!.clients?.name}
            className="flex max-w-full items-center gap-2 rounded-full bg-white/15 px-3 py-1 hover:bg-white/25"
          >
            <span className="truncate">
              #{r.tickets!.number} {initials(r.tickets!.clients?.name ?? "")}
              {r.profiles?.full_name && <span className="font-normal text-red-100"> · {r.profiles.full_name.split(" ")[0]}</span>}
            </span>
            <LiveTimer startedAt={r.started_at} />
          </Link>
        ))}
      </div>
    </div>
  );
}
