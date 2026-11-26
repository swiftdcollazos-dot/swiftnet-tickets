import { createAdminClient } from "./supabase/admin";
import { sendMessage } from "./push";
import { clockLocal, effectiveAlert, isDueSoon, lastVisitDay, LOOKAHEAD_DAYS, MORNING_HOUR, nextRepeatDate, planDay, planReminders, summaryLine, type Reminder, type ScheduleJob } from "./schedule";
import { addDays, dayStartIso, formatClock, formatDate, todayLocal } from "./time";
import { REPEATS } from "./types";

type Job = ScheduleJob & { number: number; clients: { name: string } | null };

/**
 * Runs every few minutes from the scheduler. Sends each person's morning summary once a day after 8 AM, and a heads-up
 * 45 minutes before each job or reminder with a set time, and an alarm on the morning a repeat or reminder's alarm starts
 * (a month ahead, say). A log of what was sent keeps each message to one.
 */
export async function runScheduledPushes(now = new Date()): Promise<string[]> {
  const admin = createAdminClient();
  if (!admin) return ["No SUPABASE_SERVICE_ROLE_KEY on the server."];
  const today = todayLocal(now);
  const done: string[] = [];

  /** Claims a message so it is only sent once, even if two runs overlap. */
  const claim = async (key: string) => {
    const { error } = await admin.from("push_log").insert({ key });
    return !error;
  };

  const [jobsResult, remindersResult, { data: people }] = await Promise.all([
    admin
      .from("tickets")
      .select("id, number, technician_id, status, repeats, alert_days, scheduled_for, scheduled_time, completed_at, clients(name), time_entries(started_at, ended_at)")
      .eq("status", "open"),
    admin
      .from("reminders")
      .select("id, title, due_date, due_time, assigned_to, repeats, alert_days, done_at, done_by")
      .is("done_at", null)
      .lte("due_date", addDays(today, LOOKAHEAD_DAYS)),
    admin.from("push_subscriptions").select("user_id"),
  ]);
  if (jobsResult.error) throw new Error(jobsResult.error.message);
  if (remindersResult.error) throw new Error(remindersResult.error.message);
  const jobs = (jobsResult.data ?? []) as unknown as Job[];
  const reminders = (remindersResult.data ?? []) as Reminder[];

  // Morning summary, per person with notifications on.
  const hour = Number(clockLocal(now).slice(0, 2));
  if (hour >= MORNING_HOUR && hour < 12) {
    for (const userId of new Set((people ?? []).map((p) => p.user_id as string))) {
      const day = planDay(jobs, today, userId);
      const notes = planReminders(reminders, today, userId);
      const line = summaryLine({ jobs: day.today.length, reminders: notes.today.length, overdue: day.overdue.length + notes.overdue.length });
      if (!line || !(await claim(`morning:${today}:${userId}`))) continue;
      const n = await sendMessage(userId, { title: "Good morning ☀️", body: line, url: "/dashboard" });
      done.push(`morning summary to ${userId}: ${n} device(s)`);
    }

    // Alarms: sent once, on the morning a repeat's or reminder's alarm starts. Unassigned ones go to everyone.
    for (const j of jobs) {
      const alert = effectiveAlert(j.repeats, j.alert_days);
      if (!j.repeats || !alert) continue;
      const next = nextRepeatDate(j, lastVisitDay(j.time_entries), today);
      if (addDays(next, -alert) !== today || !(await claim(`alarm:job:${j.id}:${next}`))) continue;
      const n = await sendMessage(j.technician_id, {
        title: `🔔 Coming up ${formatDate(next)}`,
        body: `#${j.number} · ${j.clients?.name ?? ""} · repeats ${REPEATS[j.repeats]?.toLowerCase() ?? ""}`,
        url: `/tickets/${j.id}`,
      });
      done.push(`alarm for job #${j.number}: ${n} device(s)`);
    }
    for (const r of reminders) {
      const alert = effectiveAlert(r.repeats, r.alert_days);
      if (!alert || addDays(r.due_date, -alert) !== today || !(await claim(`alarm:reminder:${r.id}:${r.due_date}`))) continue;
      const n = await sendMessage(r.assigned_to, { title: `🔔 Reminder on ${formatDate(r.due_date)}`, body: r.title, url: "/dashboard" });
      done.push(`alarm for reminder "${r.title}": ${n} device(s)`);
    }
  }

  // Heads-up before anything with a time today. Unassigned ones go to everyone.
  for (const j of jobs) {
    if (j.scheduled_for !== today || !j.scheduled_time || !isDueSoon(j.scheduled_time, now)) continue;
    if (!(await claim(`job:${j.id}:${today}:${j.scheduled_time}`))) continue;
    const n = await sendMessage(j.technician_id, { title: `Coming up at ${formatClock(j.scheduled_time)}`, body: `#${j.number} · ${j.clients?.name ?? ""}`, url: `/tickets/${j.id}` });
    done.push(`heads-up for job #${j.number}: ${n} device(s)`);
  }
  for (const r of reminders) {
    if (r.due_date !== today || !r.due_time || !isDueSoon(r.due_time, now)) continue;
    if (!(await claim(`reminder:${r.id}:${today}:${r.due_time}`))) continue;
    const n = await sendMessage(r.assigned_to, { title: `Reminder at ${formatClock(r.due_time)}`, body: r.title, url: "/dashboard" });
    done.push(`heads-up for reminder "${r.title}": ${n} device(s)`);
  }

  // Keep the log short: a week is plenty to stop repeats.
  await admin.from("push_log").delete().lt("sent_at", dayStartIso(addDays(today, -7)));
  return done;
}
