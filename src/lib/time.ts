// Saint Martin is on Atlantic Standard Time all year (UTC-4, no daylight saving).
export const TIME_ZONE = "America/Marigot";
const OFFSET = "-04:00";

/** Turns "2026-10-09" + "14:30" typed on a form into a UTC ISO timestamp. */
export function localToIso(date: string, time: string): string {
  return new Date(`${date}T${time}:00${OFFSET}`).toISOString();
}

/** Today's date in Saint Martin, as "2026-10-09". */
export function todayLocal(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(now);
}

export function formatDate(value: string | Date | null): string {
  if (!value) return "";
  // Plain dates ("2026-10-09") have no time; show them as-is without shifting days.
  const d = typeof value === "string" && value.length === 10 ? new Date(`${value}T12:00:00${OFFSET}`) : new Date(value);
  return new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, dateStyle: "medium" }).format(d);
}

export function formatTime(value: string | Date | null): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

/** The day `days` after "2026-10-09" (or before, when negative), as "2026-10-12". */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Midnight at the start of a Saint Martin day, as a UTC ISO timestamp. */
export function dayStartIso(date: string): string {
  return localToIso(date, "00:00");
}

/** A time of day stored as "14:30:00" (or "14:30"), shown as "2:30 PM". */
export function formatClock(value: string | null): string {
  if (!value) return "";
  const [h, m] = value.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** "Tuesday, Nov 4" for a plain date. */
export function formatDayHeading(date: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, weekday: "long", month: "short", day: "numeric" }).format(new Date(`${date}T12:00:00${OFFSET}`));
}

/** The same day of the month, `months` later; the 31st becomes the last day of a shorter month. */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const last = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
  const next = new Date(Date.UTC(y, m - 1 + months, Math.min(d, last)));
  return next.toISOString().slice(0, 10);
}
