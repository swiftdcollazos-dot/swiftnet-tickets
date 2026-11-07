import Link from "next/link";
import { requireUser } from "@/lib/supabase/server";
import { LiveTimer } from "@/components/live-timer";

type Running = {
  id: string;
  started_at: string;
  profiles: { full_name: string | null } | null;
  tickets: {
    id: string;
    number: number;
    is_project: boolean;
    repeats: string | null;
    clients: { name: string; client_type: string | null } | null;
  } | null;
};

/**
 * Each chip takes the color its kind of job has everywhere else in the app (the Work Tickets tabs):
 * service tickets amber, service calls red, repeating calls sky blue, special projects purple.
 */
function chipColor(t: NonNullable<Running["tickets"]>) {
  if (t.is_project) return { chip: "bg-purple-500 text-white hover:bg-purple-600", name: "text-purple-100" };
  if (t.repeats) return { chip: "bg-sky-500 text-white hover:bg-sky-600", name: "text-sky-100" };
  if (t.clients?.client_type === "contract") return { chip: "bg-red-500 text-white hover:bg-red-600", name: "text-red-100" };
  return { chip: "bg-amber-400 text-slate-900 hover:bg-amber-300", name: "text-slate-700" };
}

/** "Golf Hourly Co" → "GHC": the first letter or digit of each word, to keep the bar short. */
function initials(name: string) {
  return (name.match(/[\p{L}\p{N}]+/gu) ?? []).map((w) => w[0].toUpperCase()).join("");
}

/** Every timer that is still running, so you can jump between jobs while their clocks keep going. */
export async function RunningTimers() {
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("time_entries")
    .select("id, started_at, profiles(full_name), tickets(id, number, is_project, repeats, clients(name, client_type))")
    .is("ended_at", null)
    .order("started_at");
  const running = ((data ?? []) as unknown as Running[]).filter((r) => r.tickets);
  if (running.length === 0) return null;

  return (
    <div className="border-t border-white/20 bg-slate-800">
      {/* Wraps onto more lines so every running timer is visible, on phones and computers alike. */}
      <div className="mx-auto flex max-w-3xl flex-wrap gap-2 px-4 py-2 text-xs font-semibold">
        <span className="shrink-0 self-center text-slate-200"><span className="text-red-400">●</span> Running:</span>
        {running.map((r) => {
          const color = chipColor(r.tickets!);
          return (
            <Link
              key={r.id}
              href={`/tickets/${r.tickets!.id}`}
              title={r.tickets!.clients?.name}
              className={`flex max-w-full items-center gap-2 rounded-full px-3 py-1 shadow-sm ring-1 ring-white/30 ${color.chip}`}
            >
              <span className="truncate">
                #{r.tickets!.number} {initials(r.tickets!.clients?.name ?? "")}
                {r.profiles?.full_name && <span className={`font-normal ${color.name}`}> · {r.profiles.full_name.split(" ")[0]}</span>}
              </span>
              <LiveTimer startedAt={r.started_at} />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
