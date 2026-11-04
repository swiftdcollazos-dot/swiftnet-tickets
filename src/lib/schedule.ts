import { REPEAT_DAYS } from "./types";
import { addDays, todayLocal } from "./time";

/** An open or just-finished job, as the Today screen needs it. */
export type ScheduleJob = {
  id: string;
  technician_id: string | null;
  status: string;
  repeats: string;
  scheduled_for: string | null;
  scheduled_time: string | null;
  completed_at: string | null;
  time_entries: { started_at: string; ended_at: string | null }[];
};

export type Day<T> = { overdue: T[]; today: T[]; unscheduled: T[]; upcoming: T[]; done: T[] };

/** How many days ahead "Coming up" looks. */
export const UPCOMING_DAYS = 7;

/**
 * Sorts jobs into the Today screen's sections.
 * - One-time jobs go by their scheduled date: before today is overdue, today is today, the next week is coming up,
 *   and no date at all is "not scheduled". Completed today is done.
 * - Standing (repeating) jobs never close: they are due when the week or month since the last visit has passed, or on
 *   the date they were scheduled for (until someone visits), and count as done once someone logs time on them today.
 * `who` keeps only that technician's jobs (plus jobs nobody is assigned to); null keeps everyone's.
 */
export function planDay<T extends ScheduleJob>(jobs: T[], today: string, who: string | null): Day<T> {
  const day: Day<T> = { overdue: [], today: [], unscheduled: [], upcoming: [], done: [] };
  const horizon = addDays(today, UPCOMING_DAYS);
  for (const job of jobs) {
    if (who && job.technician_id && job.technician_id !== who) continue;
    if (job.status !== "open") {
      if (job.completed_at && todayLocal(new Date(job.completed_at)) === today) day.done.push(job);
      continue;
    }
    if (job.repeats) {
      const days = job.time_entries.map((e) => todayLocal(new Date(e.started_at))).sort();
      const last = days.at(-1);
      // The scheduled date wins until someone visits on or after it; then the next visit is one interval later.
      const byVisit = last ? addDays(last, REPEAT_DAYS[job.repeats] ?? 7) : today;
      const next = job.scheduled_for && (!last || last < job.scheduled_for) ? job.scheduled_for : byVisit;
      if (last === today) day.done.push(job);
      else if (next <= today) day.today.push(job);
      else if (next <= horizon) day.upcoming.push(job);
      continue;
    }
    const date = job.scheduled_for;
    if (!date) day.unscheduled.push(job);
    else if (date < today) day.overdue.push(job);
    else if (date === today) day.today.push(job);
    else if (date <= horizon) day.upcoming.push(job);
  }
  // Earliest first; within a day, jobs with a time come first, in time order.
  const order = (a: T, b: T) =>
    (a.scheduled_for ?? "").localeCompare(b.scheduled_for ?? "") || (a.scheduled_time ?? "99").localeCompare(b.scheduled_time ?? "99");
  day.overdue.sort(order);
  day.today.sort(order);
  day.upcoming.sort(order);
  return day;
}
