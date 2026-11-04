import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { requireUser } from "@/lib/supabase/server";
import { isOwner } from "@/lib/owner";
import { entryMinutes, formatMinutes } from "@/lib/billing";
import { dayStartIso, formatClock, formatDate, formatDayHeading, todayLocal } from "@/lib/time";
import { planDay, UPCOMING_DAYS, type ScheduleJob } from "@/lib/schedule";
import { recordLabel } from "@/lib/types";
import { VAPID_PUBLIC_KEY } from "@/lib/vapid";
import { AutoRefresh } from "@/components/auto-refresh";
import { LiveTimer } from "@/components/live-timer";
import { Loading } from "@/components/loading";
import { NotificationsPrompt } from "@/components/notifications-toggle";

/** The Today screen: the first thing seen in the morning. What's overdue, what's on for today, and what got done. */
export default function TodayPage(props: PageProps<"/dashboard">) {
  return (
    <>
      <NotificationsPrompt publicKey={VAPID_PUBLIC_KEY} />
      <Suspense fallback={<Loading />}>
        <Today searchParams={props.searchParams} />
      </Suspense>
      <AutoRefresh seconds={60} />
    </>
  );
}

type Job = Omit<ScheduleJob, "time_entries"> & {
  number: number;
  ticket_date: string;
  item_to_service: string;
  machine_name: string;
  is_project: boolean;
  clients: { name: string; client_type: string };
  time_entries: { started_at: string; ended_at: string | null; technician_id: string | null }[];
};

const FIELDS =
  "id, number, ticket_date, item_to_service, machine_name, is_project, status, repeats, technician_id, scheduled_for, scheduled_time, completed_at, clients!inner(name, client_type), time_entries(started_at, ended_at, technician_id)";

async function Today({ searchParams }: { searchParams: PageProps<"/dashboard">["searchParams"] }) {
  const { supabase, user } = await requireUser();
  const today = todayLocal();
  // Each person sees their own day; only the owner can switch to everyone's.
  const owner = isOwner(user.email);
  const everyone = owner && (await searchParams).who === "all";

  const [open, done, { data: profiles }] = await Promise.all([
    supabase.from("tickets").select(FIELDS).eq("status", "open"),
    supabase.from("tickets").select(FIELDS).neq("status", "open").gte("completed_at", dayStartIso(today)),
    supabase.from("profiles").select("id, full_name"),
  ]);
  if (open.error) throw new Error(open.error.message);
  if (done.error) throw new Error(done.error.message);
  const names = new Map((profiles ?? []).map((p) => [p.id, p.full_name as string]));
  const jobs = [...(open.data ?? []), ...(done.data ?? [])] as unknown as Job[];
  const day = planDay(jobs, today, everyone ? null : user.id);
  const rows = (list: Job[], frame: string, showDate = false) =>
    list.map((j) => <JobRow key={j.id} job={j} frame={frame} showDate={showDate} who={everyone ? names.get(j.technician_id ?? "") : undefined} names={names} />);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="h1">Today</h1>
          <p className="text-sm text-slate-500">{formatDayHeading(today)}</p>
        </div>
        {owner && (
          <div className="flex overflow-hidden rounded-lg border border-slate-300 text-sm font-semibold">
            <Link href="/dashboard" className={`px-3 py-1.5 ${everyone ? "bg-white text-slate-600" : "bg-brand text-white"}`}>Mine</Link>
            <Link href="/dashboard?who=all" className={`px-3 py-1.5 ${everyone ? "bg-brand text-white" : "bg-white text-slate-600"}`}>Everyone</Link>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Overdue" value={day.overdue.length} color={day.overdue.length ? "text-red-600" : "text-slate-400"} />
        <Stat label="Today" value={day.today.length} color="text-sky-600" />
        <Stat label="Done today" value={day.done.length} color="text-green-600" />
      </div>

      {day.overdue.length > 0 && (
        <Section title="Overdue" count={day.overdue.length}>{rows(day.overdue, "border-red-500 bg-red-50/50", true)}</Section>
      )}
      <Section title="Scheduled for today" count={day.today.length} empty="Nothing scheduled for today.">
        {rows(day.today, "border-sky-500")}
      </Section>
      <Section title="Done today" count={day.done.length} empty="Nothing finished yet today.">
        {rows(day.done, "border-green-500 bg-green-50/50")}
      </Section>
      <Section title={`Coming up (next ${UPCOMING_DAYS} days)`} count={day.upcoming.length} folded>
        {rows(day.upcoming, "border-slate-300", true)}
      </Section>
      <Section title="Open, not scheduled" count={day.unscheduled.length} folded>
        {rows(day.unscheduled, "border-amber-400")}
      </Section>
      <p className="text-center text-xs text-slate-400">Set a job&apos;s date under Job details › Scheduled for. Updates every minute.</p>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="card p-3 text-center">
      <div className={`text-3xl font-bold ${color}`}>{value}</div>
      <div className="text-xs font-semibold leading-tight text-slate-500">{label}</div>
    </div>
  );
}

/** A list of jobs. `folded` sections start closed so the day's work stays at the top. */
function Section({ title, count, empty, folded, children }: { title: string; count: number; empty?: string; folded?: boolean; children: ReactNode }) {
  if (folded) {
    if (!count) return null;
    return (
      <details className="group">
        <summary className="h2 mb-2 flex cursor-pointer list-none items-center justify-between [&::-webkit-details-marker]:hidden">
          {title} ({count})
          <span className="text-sm text-slate-500 transition-transform group-open:rotate-180">▼</span>
        </summary>
        <ul className="space-y-2">{children}</ul>
      </details>
    );
  }
  return (
    <section>
      <h2 className="h2 mb-2">{title} ({count})</h2>
      {count === 0 ? <p className="card text-center text-sm text-slate-500">{empty}</p> : <ul className="space-y-2">{children}</ul>}
    </section>
  );
}

function JobRow({ job: j, frame, showDate, who, names }: { job: Job; frame: string; showDate: boolean; who?: string; names: Map<string, string> }) {
  const running = j.time_entries.find((e) => !e.ended_at);
  const logged = j.time_entries.filter((e) => e.ended_at).reduce((m, e) => m + entryMinutes({ startedAt: e.started_at, endedAt: e.ended_at }), 0);
  const when = [showDate && j.scheduled_for ? formatDate(j.scheduled_for) : "", formatClock(j.scheduled_time)].filter(Boolean).join(" · ");
  const detail = [j.repeats ? "🔁 Repeats" : recordLabel(j.clients.client_type as "hourly" | "contract", j.is_project), j.item_to_service, j.machine_name].filter(Boolean).join(" · ");
  return (
    <li>
      <Link href={`/tickets/${j.id}`} className={`card flex items-center gap-3 border-2 ${frame}`}>
        {when && <div className="w-16 shrink-0 text-sm font-bold leading-tight text-slate-700">{when}</div>}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-slate-400">#{j.number}</span>
            <span className="truncate font-semibold">{j.clients.name}</span>
          </div>
          <div className="truncate text-sm text-slate-500">
            {detail}
            {who ? ` · ${who}` : ""}
          </div>
        </div>
        <div className="shrink-0 text-right text-sm">
          {running ? (
            <>
              <div className="font-semibold text-red-700">● <LiveTimer startedAt={running.started_at} /></div>
              <div className="text-xs text-slate-500">{names.get(running.technician_id ?? "") ?? "Working"}</div>
            </>
          ) : j.status !== "open" ? (
            <div className="font-semibold text-green-700">✓ Done</div>
          ) : (
            <div className="text-xs text-slate-500">{logged > 0 ? `${formatMinutes(logged)} logged` : "no time yet"}</div>
          )}
        </div>
      </Link>
    </li>
  );
}
