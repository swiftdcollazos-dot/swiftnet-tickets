import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { requireUser } from "@/lib/supabase/server";
import { isOwner } from "@/lib/owner";
import { entryMinutes, formatMinutes } from "@/lib/billing";
import { addDays, dayStartIso, formatClock, formatDate, formatDayHeading, todayLocal } from "@/lib/time";
import { planDay, planReminders, UPCOMING_DAYS, type Reminder, type ScheduleJob } from "@/lib/schedule";
import { REPEATS, recordLabel } from "@/lib/types";
import { completeReminder, createReminder, deleteReminder, reopenReminder } from "@/app/actions";
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
  // Each person sees their own day; only the owner can switch to another technician's.
  const owner = isOwner(user.email);
  const asked = owner ? (await searchParams).who : undefined;

  const [open, done, reminders, { data: profiles }] = await Promise.all([
    supabase.from("tickets").select(FIELDS).eq("status", "open"),
    supabase.from("tickets").select(FIELDS).neq("status", "open").gte("completed_at", dayStartIso(today)),
    // Open reminders up to a week ahead, and the ones ticked off today.
    supabase
      .from("reminders")
      .select("id, title, due_date, due_time, assigned_to, repeats, done_at, done_by")
      .or(`done_at.is.null,done_at.gte.${dayStartIso(today)}`)
      .lte("due_date", addDays(today, UPCOMING_DAYS)),
    supabase.from("profiles").select("id, full_name").order("full_name"),
  ]);
  if (open.error) throw new Error(open.error.message);
  if (done.error) throw new Error(done.error.message);
  if (reminders.error) throw new Error(reminders.error.message);
  const names = new Map((profiles ?? []).map((p) => [p.id, p.full_name as string]));
  const jobs = [...(open.data ?? []), ...(done.data ?? [])] as unknown as Job[];
  const people = (profiles ?? []).map((p) => ({ id: p.id as string, name: p.full_name as string }));
  const who = typeof asked === "string" && names.has(asked) ? asked : user.id;
  const day = planDay(jobs, today, who);
  const notes = planReminders((reminders.data ?? []) as Reminder[], today, who);
  const rows = (list: Job[], frame: string, showDate = false) =>
    list.map((j) => <JobRow key={j.id} job={j} frame={frame} showDate={showDate} names={names} />);
  const reminderRows = (list: Reminder[], frame: string, showDate = false) =>
    list.map((r) => <ReminderRow key={r.id} reminder={r} frame={frame} showDate={showDate} names={names} />);
  const count = { overdue: day.overdue.length + notes.overdue.length, today: day.today.length + notes.today.length, done: day.done.length + notes.done.length, upcoming: day.upcoming.length + notes.upcoming.length };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="h1">{names.get(who) ?? "Today"}</h1>
          <p className="text-sm text-slate-500">Today · {formatDayHeading(today)}</p>
        </div>
        {owner && people.length > 1 && (
          // The owner picks whose day to see, by name.
          <div className="flex overflow-hidden rounded-lg border border-slate-300 text-sm font-semibold">
            {people.map((p) => (
              <Link key={p.id} href={p.id === user.id ? "/dashboard" : `/dashboard?who=${p.id}`} className={`px-3 py-1.5 ${p.id === who ? "bg-brand text-white" : "bg-white text-slate-600"}`}>
                {p.name.split(" ")[0]}
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Overdue" value={count.overdue} color={count.overdue ? "text-red-600" : "text-slate-400"} />
        <Stat label="Today" value={count.today} color="text-sky-600" />
        <Stat label="Done today" value={count.done} color="text-green-600" />
      </div>

      <NewReminder today={today} me={who} people={people} />

      {count.overdue > 0 && (
        <Section title="Overdue" count={count.overdue}>
          {reminderRows(notes.overdue, "border-red-500 bg-red-50/50", true)}
          {rows(day.overdue, "border-red-500 bg-red-50/50", true)}
        </Section>
      )}
      <Section title="Scheduled for today" count={count.today} empty="Nothing scheduled for today.">
        {rows(day.today, "border-sky-500")}
        {reminderRows(notes.today, "border-sky-500")}
      </Section>
      <Section title="Done today" count={count.done} empty="Nothing finished yet today.">
        {rows(day.done, "border-green-500 bg-green-50/50")}
        {reminderRows(notes.done, "border-green-500 bg-green-50/50")}
      </Section>
      <Section title={`Coming up (next ${UPCOMING_DAYS} days)`} count={count.upcoming} folded>
        {rows(day.upcoming, "border-slate-300", true)}
        {reminderRows(notes.upcoming, "border-slate-300", true)}
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

function JobRow({ job: j, frame, showDate, names }: { job: Job; frame: string; showDate: boolean; names: Map<string, string> }) {
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

/** "+ Reminder": a short to-do with a day, optional time, who it's for, and whether it repeats. */
function NewReminder({ today, me, people }: { today: string; me: string; people: { id: string; name: string }[] }) {
  return (
    <details className="card">
      <summary className="cursor-pointer list-none font-semibold text-brand [&::-webkit-details-marker]:hidden">+ Reminder</summary>
      <form action={createReminder} className="mt-3 grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="label label-issue" htmlFor="title">Remind me to</label>
          <input className="input" id="title" name="title" placeholder="Call Marina back about the printer" required />
        </div>
        <div>
          <label className="label label-schedule" htmlFor="due_date">Day</label>
          <input className="input" type="date" id="due_date" name="due_date" defaultValue={today} required />
        </div>
        <div>
          <label className="label label-schedule" htmlFor="due_time">Time <span className="font-normal normal-case text-slate-400">(optional)</span></label>
          <input className="input" type="time" id="due_time" name="due_time" />
        </div>
        <div>
          <label className="label label-schedule" htmlFor="assigned_to">For</label>
          <select className="input" id="assigned_to" name="assigned_to" defaultValue={me}>
            {people.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
            <option value="everyone">Everyone</option>
          </select>
        </div>
        <div>
          <label className="label label-when" htmlFor="reminder_repeats">Repeats</label>
          <select className="input" id="reminder_repeats" name="repeats" defaultValue="">
            <option value="">No</option>
            {Object.entries(REPEATS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <button className="btn col-span-2">Add reminder</button>
      </form>
    </details>
  );
}

/** A reminder with a tick box. Ticked ones (done today) can be unticked. */
function ReminderRow({ reminder: r, frame, showDate, names }: { reminder: Reminder; frame: string; showDate: boolean; names: Map<string, string> }) {
  const when = [showDate ? formatDate(r.due_date) : "", formatClock(r.due_time)].filter(Boolean).join(" · ");
  const done = Boolean(r.done_at);
  const forWhom = r.assigned_to ? "" : "Everyone";
  const detail = ["🔔 Reminder", r.repeats ? `🔁 ${REPEATS[r.repeats]?.toLowerCase()}` : "", forWhom, done && r.done_by ? `done by ${names.get(r.done_by) ?? ""}` : ""].filter(Boolean).join(" · ");
  return (
    <li className={`card flex items-center gap-3 border-2 ${frame}`}>
      <form action={(done ? reopenReminder : completeReminder).bind(null, r.id)}>
        <button
          aria-label={done ? "Mark not done" : "Mark done"}
          className={`flex h-8 w-8 items-center justify-center rounded-md border-2 text-lg font-bold ${done ? "border-green-600 bg-green-600 text-white" : "border-slate-400 bg-white text-transparent hover:border-green-600 hover:text-green-600"}`}
        >
          ✓
        </button>
      </form>
      {when && <div className="w-16 shrink-0 text-sm font-bold leading-tight text-slate-700">{when}</div>}
      <div className="min-w-0 flex-1">
        <div className={`font-semibold ${done ? "text-slate-500 line-through" : ""}`}>{r.title}</div>
        <div className="truncate text-sm text-slate-500">{detail}</div>
      </div>
      {!done && (
        <form action={deleteReminder.bind(null, r.id)}>
          <button aria-label="Delete reminder" className="px-2 text-xl text-slate-400 hover:text-red-600">×</button>
        </form>
      )}
    </li>
  );
}
