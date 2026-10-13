import { requireUser } from "@/lib/supabase/server";
import { pendingCounts } from "@/lib/pending";

/** Small count bubble, hidden at zero. */
export function CountBadge({ count, className = "bg-amber-400 text-slate-900" }: { count: number; className?: string }) {
  if (count === 0) return null;
  return <span className={`ml-1 inline-flex min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-xs font-bold leading-5 ${className}`}>{count}</span>;
}

/** Total open service tickets and calls, for the Work Tickets link in the header. */
export async function PendingBadge() {
  const { supabase } = await requireUser();
  const { tickets, calls } = await pendingCounts(supabase);
  return <CountBadge count={tickets + calls} />;
}
