import { describe, expect, it } from "vitest";
import { nextRepeatDate, nextReminderDate, planDay, planReminders, type Reminder, type ScheduleJob } from "./schedule";

const job = (id: string, over: Partial<ScheduleJob> = {}): ScheduleJob => ({
  id, technician_id: "me", status: "open", repeats: "", scheduled_for: null, scheduled_time: null, completed_at: null, time_entries: [], ...over,
});
const ids = (list: { id: string }[]) => list.map((j) => j.id);
const TODAY = "2026-11-04";

describe("Today screen", () => {
  it("sorts one-time jobs by their scheduled date", () => {
    const day = planDay(
      [job("late", { scheduled_for: "2026-11-02" }), job("now", { scheduled_for: TODAY }), job("soon", { scheduled_for: "2026-11-08" }), job("far", { scheduled_for: "2026-12-01" }), job("none")],
      TODAY, null,
    );
    expect(ids(day.overdue)).toEqual(["late"]);
    expect(ids(day.today)).toEqual(["now"]);
    expect(ids(day.upcoming)).toEqual(["soon"]);
    expect(ids(day.unscheduled)).toEqual(["none"]);
  });

  it("puts timed jobs first, in time order", () => {
    const day = planDay([job("any", { scheduled_for: TODAY }), job("ten", { scheduled_for: TODAY, scheduled_time: "10:00:00" }), job("eight", { scheduled_for: TODAY, scheduled_time: "08:30:00" })], TODAY, null);
    expect(ids(day.today)).toEqual(["eight", "ten", "any"]);
  });

  it("counts jobs completed today in Saint Martin time as done", () => {
    const day = planDay(
      [job("done", { status: "completed", completed_at: "2026-11-04T05:00:00Z" }), job("yesterday", { status: "completed", completed_at: "2026-11-04T03:00:00Z" })],
      TODAY, null,
    );
    expect(ids(day.done)).toEqual(["done"]); // 03:00 UTC is still Nov 3 at 11 PM locally
  });

  it("shows only the person's own jobs, plus unassigned ones", () => {
    const day = planDay([job("mine"), job("theirs", { technician_id: "daniel" }), job("nobody", { technician_id: null })], TODAY, "me");
    expect(ids(day.unscheduled)).toEqual(["mine", "nobody"]);
  });

  it("brings back a weekly job a week after the last visit, and marks it done once visited today", () => {
    const visit = (date: string) => [{ started_at: `${date}T14:00:00Z`, ended_at: `${date}T15:00:00Z` }];
    const day = planDay(
      [job("due", { repeats: "weekly", time_entries: visit("2026-10-28") }), job("later", { repeats: "weekly", time_entries: visit("2026-11-01") }), job("visited", { repeats: "weekly", time_entries: visit(TODAY) })],
      TODAY, null,
    );
    expect(ids(day.today)).toEqual(["due"]);
    expect(ids(day.upcoming)).toEqual(["later"]);
    expect(ids(day.done)).toEqual(["visited"]);
  });

  it("uses a repeating job's scheduled date until someone visits on or after it", () => {
    const visit = (date: string) => [{ started_at: `${date}T14:00:00Z`, ended_at: `${date}T15:00:00Z` }];
    const day = planDay(
      [job("booked", { repeats: "monthly", scheduled_for: TODAY, time_entries: visit("2026-10-30") }), job("handled", { repeats: "monthly", scheduled_for: "2026-11-01", time_entries: visit("2026-11-02") })],
      TODAY, null,
    );
    expect(ids(day.today)).toEqual(["booked"]);
    expect(ids(day.unscheduled)).toEqual([]);
    expect(ids(day.upcoming)).toEqual([]);
  });

  it("shows a yearly job under Coming up from its alarm, and on its day under Today", () => {
    const yearly = (id: string, date: string, alert = 30) => job(id, { repeats: "yearly", scheduled_for: date, alert_days: alert });
    const day = planDay(
      [yearly("in-alarm", "2026-12-01"), yearly("too-early", "2026-12-10"), yearly("no-alarm", "2026-12-01", 0), yearly("on-the-day", TODAY)],
      TODAY, null,
    );
    expect(ids(day.upcoming)).toEqual(["in-alarm"]);
    expect(ids(day.today)).toEqual(["on-the-day"]);
  });

  it("keeps weekly and monthly jobs as before when the alarm is as long as the repeat", () => {
    const visit = [{ started_at: "2026-10-20T14:00:00Z", ended_at: "2026-10-20T15:00:00Z" }];
    const day = planDay([job("monthly", { repeats: "monthly", alert_days: 30, time_entries: visit })], TODAY, null);
    expect(ids(day.upcoming)).toEqual([]); // next visit Nov 19, more than a week away
  });

  it("brings a yearly job back a year after the visit, counting a visit made within the alarm", () => {
    const visit = (date: string) => [{ started_at: `${date}T14:00:00Z`, ended_at: `${date}T15:00:00Z` }];
    const yearly = { repeats: "yearly", scheduled_for: "2026-12-01", alert_days: 30 };
    expect(nextRepeatDate(yearly, undefined, TODAY)).toBe("2026-12-01");
    expect(nextRepeatDate(yearly, "2026-11-20", TODAY)).toBe("2027-11-20"); // done 11 days early
    expect(nextRepeatDate(yearly, "2026-10-01", TODAY)).toBe("2026-12-01"); // an unrelated visit before the alarm
    expect(nextRepeatDate({ ...yearly, scheduled_for: null }, "2024-02-29", TODAY)).toBe("2025-02-28");
    const day = planDay([job("done-early", { ...yearly, time_entries: visit("2026-11-20") })], TODAY, null);
    expect(ids(day.upcoming)).toEqual([]);
  });
});

describe("Reminders", () => {
  const r = (id: string, over: Partial<Reminder> = {}): Reminder => ({ id, title: id, due_date: TODAY, due_time: null, assigned_to: null, repeats: "", done_at: null, done_by: null, ...over });

  it("sorts reminders by day, and shows the person's own plus everyone's", () => {
    const day = planReminders(
      [r("late", { due_date: "2026-11-01" }), r("mine", { assigned_to: "me", due_time: "09:00:00" }), r("all"), r("daniels", { assigned_to: "daniel" }), r("ticked", { done_at: "2026-11-04T13:00:00Z" }), r("next", { due_date: "2026-11-06" })],
      TODAY, "me",
    );
    expect(ids(day.overdue)).toEqual(["late"]);
    expect(ids(day.today)).toEqual(["mine", "all"]);
    expect(ids(day.done)).toEqual(["ticked"]);
    expect(ids(day.upcoming)).toEqual(["next"]);
  });

  it("shows a reminder with an alarm under Coming up ahead of its day", () => {
    const day = planReminders(
      [r("renew", { due_date: "2026-12-01", repeats: "yearly", alert_days: 30 }), r("quiet", { due_date: "2026-12-01", repeats: "yearly", alert_days: 0 }), r("weekly", { due_date: "2026-11-20", repeats: "weekly", alert_days: 30 })],
      TODAY, null,
    );
    expect(ids(day.upcoming)).toEqual(["renew"]);
  });

  it("brings repeating reminders back a week or a month later", () => {
    expect(nextReminderDate("2026-11-04", "weekly")).toBe("2026-11-11");
    expect(nextReminderDate("2026-01-31", "monthly")).toBe("2026-02-28");
    expect(nextReminderDate("2026-12-15", "monthly")).toBe("2027-01-15");
    expect(nextReminderDate("2026-11-04", "yearly")).toBe("2027-11-04");
    expect(nextReminderDate("2028-02-29", "yearly")).toBe("2029-02-28");
    expect(nextReminderDate("2026-11-04", "")).toBe("");
  });
});
