import { REPEAT_DAYS } from "./types";
import { addDays, addMonths, TIME_ZONE, todayLocal } from "./time";

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

/** A to-do that isn't a job ("Call Marina back"). */
export type Reminder = {
  id: string;
  title: string;
  due_date: string;
  due_time: string | null;
  assigned_to: string | null;
  repeats: string;
  done_at: string | null;
  done_by: string | null;
};

/**
 * Sorts reminders into the same sections as jobs: past their day and not ticked off is overdue, and ticked off today
 * is done. `who` keeps that person's reminders and the ones for everyone; null keeps all.
 */
export function planReminders<T extends Reminder>(reminders: T[], today: string, who: string | null): Omit<Day<T>, "unscheduled"> {
  const day: Omit<Day<T>, "unscheduled"> = { overdue: [], today: [], upcoming: [], done: [] };
  const horizon = addDays(today, UPCOMING_DAYS);
  for (const r of reminders) {
    if (who && r.assigned_to && r.assigned_to !== who) continue;
    if (r.done_at) {
      if (todayLocal(new Date(r.done_at)) === today) day.done.push(r);
    } else if (r.due_date < today) day.overdue.push(r);
    else if (r.due_date === today) day.today.push(r);
    else if (r.due_date <= horizon) day.upcoming.push(r);
  }
  const order = (a: T, b: T) => a.due_date.localeCompare(b.due_date) || (a.due_time ?? "99").localeCompare(b.due_time ?? "99");
  day.overdue.sort(order);
  day.today.sort(order);
  day.upcoming.sort(order);
  return day;
}

/** The next day a repeating reminder comes back, counted from the day it was due. "" when it doesn't repeat. */
export function nextReminderDate(dueDate: string, repeats: string): string {
  if (repeats === "weekly") return addDays(dueDate, 7);
  if (repeats === "monthly") return addMonths(dueDate, 1);
  return "";
}

/** The morning summary goes out at 8:00 AM Saint Martin time (any run between 8 and noon sends it, once). */
export const MORNING_HOUR = 8;
/** How long before a job or reminder with a set time the heads-up is sent. */
export const HEADS_UP_MINUTES = 45;

/** "08:15" in Saint Martin, for comparing with times stored as "08:30:00". */
export function clockLocal(now: Date): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
}

/** True when a time of day ("14:30:00") is after `now` and at most HEADS_UP_MINUTES later, on the same day. */
export function isDueSoon(time: string, now: Date): boolean {
  const [h, m] = time.split(":").map(Number);
  const [nh, nm] = clockLocal(now).split(":").map(Number);
  const diff = h * 60 + m - (nh * 60 + nm);
  return diff > 0 && diff <= HEADS_UP_MINUTES;
}

/** "Today: 3 jobs, 2 reminders · 1 overdue", or "" when there's nothing on. */
export function summaryLine(counts: { jobs: number; reminders: number; overdue: number }): string {
  const parts = [
    counts.jobs ? `${counts.jobs} ${counts.jobs === 1 ? "job" : "jobs"}` : "",
    counts.reminders ? `${counts.reminders} ${counts.reminders === 1 ? "reminder" : "reminders"}` : "",
  ].filter(Boolean);
  const today = parts.length ? `Today: ${parts.join(", ")}` : "";
  const overdue = counts.overdue ? `${counts.overdue} overdue` : "";
  return [today, overdue].filter(Boolean).join(" · ");
}

