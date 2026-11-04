import { describe, expect, it } from "vitest";
import { planDay, type ScheduleJob } from "./schedule";

const job = (id: string, over: Partial<ScheduleJob> = {}): ScheduleJob => ({
  id, technician_id: "me", status: "open", repeats: "", scheduled_for: null, scheduled_time: null, completed_at: null, time_entries: [], ...over,
});
const ids = (list: ScheduleJob[]) => list.map((j) => j.id);
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
});
