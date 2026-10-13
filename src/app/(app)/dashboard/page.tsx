import Link from "next/link";
import { Suspense } from "react";
import { requireUser } from "@/lib/supabase/server";
import { entryMinutes, formatMinutes } from "@/lib/billing";
import { formatDate } from "@/lib/time";
import { AutoRefresh } from "@/components/auto-refresh";
import { LiveTimer } from "@/components/live-timer";
import { Loading } from "@/components/loading";

export default function DashboardPage() {
  return (
    <>
      <h1 className="h1 mb-4">Dashboard</h1>
      <Suspense fallback={<Loading />}>
        <Dashboard />
      </Suspense>
      <AutoRefresh seconds={60} />
    </>
  );
}

type Entry = { started_at: string; ended_at: string | null; technician_id: string | null };
type Job = {
  id: string;
  number: number;
  ticket_date: string;
  item_to_service: string;
  machine_name: string;
  is_project: boolean;
  clients: { name: string; client_type: string };
  time_entries: Entry[];
};

async function Dashboard() {
  const { supabase } = await requireUser();
  const [{ data, error }, { data: profiles }] = await Promise.all([
    supabase
      .from("tickets")
      .select("id, number, ticket_date, item_to_service, machine_name, is_project, clients!inner(name, client_type), time_entries(started_at, ended_at, technician_id)")
      .eq("status", "open")
      .order("number", { ascending: false }),
    supabase.from("profiles").select("id, full_name"),
  ]);
  if (error) throw new Error(error.message);
  const names = new Map((profiles ?? []).map((p) => [p.id, p.full_name as string]));
  const jobs = (data ?? []) as unknown as Job[];

  // Jobs with a running timer first, then newest.
  const runningOf = (j: Job) => j.time_entries.find((e) => !e.ended_at);
  const sorted = [...jobs].sort((a, b) => Number(Boolean(runningOf(b))) - Number(Boolean(runningOf(a))));
  const projects = sorted.filter((j) => j.is_project);
  const calls = sorted.filter((j) => !j.is_project && j.clients.client_type === "contract");
  const tickets = sorted.filter((j) => !j.is_project && j.clients.client_type !== "contract");
  const runningCount = jobs.filter(runningOf).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Pending service calls" value={calls.length} href="/?view=calls&status=open" pending={CALL_FRAME} />
        <Stat label="Pending service tickets" value={tickets.length} href="/?status=open" pending={OPEN_FRAME} />
        <Stat label="Pending special projects" value={projects.length} href="/projects?status=open" pending={PROJECT_FRAME} />
        <Stat label="Timers running" value={runningCount} highlight={runningCount > 0} />
      </div>

      <JobList title="Service calls being worked on" empty="No open service calls." jobs={calls} names={names} frame={CALL_FRAME} />
      <JobList title="Open service tickets" empty="No open service tickets." jobs={tickets} names={names} frame={OPEN_FRAME} />
      <JobList title="Open special projects" empty="No open special projects." jobs={projects} names={names} frame={PROJECT_FRAME} />
      <p className="text-center text-xs text-slate-400">Updates every minute.</p>
    </div>
  );
}

// Pending frames: red for service calls, yellow for service tickets, purple for special projects.
const CALL_FRAME = "border-red-500";
const OPEN_FRAME = "border-amber-400";
const PROJECT_FRAME = "border-purple-500";

function Stat(props: { label: string; value: number; href?: string; highlight?: boolean; pending?: string }) {
  const { label, value, href, highlight } = props;
  const frame = props.pending && value > 0 ? `border-2 ${props.pending}` : "";
  const body = (
    <>
      <div className={`text-3xl font-bold ${highlight ? "text-red-600" : "text-brand"}`}>{value}</div>
      <div className="text-xs font-semibold leading-tight text-slate-500">{label}</div>
    </>
  );
  return href ? (
    <Link href={href} className={`card p-3 text-center hover:border-brand ${frame}`}>{body}</Link>
  ) : (
    <div className="card p-3 text-center">{body}</div>
  );
}

function JobList(props: { title: string; empty: string; jobs: Job[]; names: Map<string, string>; frame: string }) {
  const { title, empty, jobs, names, frame } = props;
  return (
    <section>
      <h2 className="h2 mb-2">{title} ({jobs.length})</h2>
      {jobs.length === 0 ? (
        <p className="card text-center text-sm text-slate-500">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {jobs.map((j) => {
            const running = j.time_entries.find((e) => !e.ended_at);
            const done = j.time_entries.filter((e) => e.ended_at).reduce((m, e) => m + entryMinutes({ startedAt: e.started_at, endedAt: e.ended_at }), 0);
            const detail = [j.item_to_service, j.machine_name].filter(Boolean).join(" · ");
            return (
              <li key={j.id}>
                <Link href={`/tickets/${j.id}`} className={`card flex items-center gap-3 border-2 ${frame} ${running ? "bg-red-50" : ""}`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-slate-400">#{j.number}</span>
                      <span className="truncate font-semibold">{j.clients.name}</span>
                    </div>
                    <div className="truncate text-sm text-slate-500">
                      {formatDate(j.ticket_date)}
                      {detail ? ` · ${detail}` : ""}
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-sm">
                    {running ? (
                      <>
                        <div className="font-semibold text-red-700">● <LiveTimer startedAt={running.started_at} /></div>
                        <div className="text-xs text-slate-500">{names.get(running.technician_id ?? "") ?? "Working"}</div>
                      </>
                    ) : (
                      <>
                        <div className="font-semibold">{done > 0 ? formatMinutes(done) : "—"}</div>
                        <div className="text-xs text-slate-500">{done > 0 ? "logged" : "no time yet"}</div>
                      </>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
