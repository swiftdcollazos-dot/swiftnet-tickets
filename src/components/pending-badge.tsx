import { requireUser } from "@/lib/supabase/server";
import { pendingCounts } from "@/lib/pending";

/** Small count bubble, hidden at zero. */
export function CountBadge({ count, className = "bg-amber-400 text-slate-900" }: { count: number; className?: string }) {
  if (count === 0) return null;
  return <span className={`ml-1 inline-flex min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-xs font-bold leading-5 ${className}`}>{count}</span>;
}

/** Open jobs for a header link: service tickets and calls for Work Tickets, or special projects. */
export async function PendingBadge({ projects = false }: { projects?: boolean }) {
  const { supabase } = await requireUser();
  const counts = await pendingCounts(supabase);
  return projects ? (
    <CountBadge count={counts.projects} className="bg-purple-500 text-white" />
  ) : (
    <CountBadge count={counts.tickets + counts.calls} />
  );
}
