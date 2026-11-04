import { describe, expect, it } from "vitest";
import { clockLocal, isDueSoon, summaryLine } from "./schedule";

describe("Scheduled notifications", () => {
  it("reads the clock in Saint Martin time", () => {
    expect(clockLocal(new Date("2026-11-04T12:05:00Z"))).toBe("08:05");
  });

  it("sends the heads-up within 45 minutes before, not after", () => {
    const now = new Date("2026-11-04T13:20:00Z"); // 9:20 AM locally
    expect(isDueSoon("10:00:00", now)).toBe(true);
    expect(isDueSoon("10:05:00", now)).toBe(true);
    expect(isDueSoon("10:06:00", now)).toBe(false);
    expect(isDueSoon("09:20:00", now)).toBe(false);
  });

  it("writes the morning line, and nothing on an empty day", () => {
    expect(summaryLine({ jobs: 3, reminders: 1, overdue: 2 })).toBe("Today: 3 jobs, 1 reminder · 2 overdue");
    expect(summaryLine({ jobs: 0, reminders: 0, overdue: 1 })).toBe("1 overdue");
    expect(summaryLine({ jobs: 0, reminders: 0, overdue: 0 })).toBe("");
  });
});
