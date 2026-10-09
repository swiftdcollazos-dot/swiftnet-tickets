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
