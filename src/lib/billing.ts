// All money is in whole cents to avoid rounding errors.

export type BillingRules = {
  hourlyRateCents: number;
  taxRatePct: number;
  taxLabor: boolean;
  roundingMinutes: number;
  minimumMinutes: number;
};

export type TimeEntry = { startedAt: string | Date; endedAt: string | Date | null };
export type PartLine = { qty: number; unitPriceCents: number };

export type TicketTotals = {
  /** Every technician's time added up, for the company's own records. */
  workedMinutes: number;
  /** Time the job was being worked on by anyone; overlapping timers count once. This is what the client pays for. */
  jobMinutes: number;
  billableMinutes: number;
  laborCents: number;
  materialsCents: number;
  taxCents: number;
  totalCents: number;
  depositCents: number;
  balanceDueCents: number;
};

/** Minutes between start and end. A running timer counts up to `now`. */
export function entryMinutes(entry: TimeEntry, now: Date = new Date()): number {
  const start = new Date(entry.startedAt).getTime();
  const end = entry.endedAt ? new Date(entry.endedAt).getTime() : now.getTime();
  return Math.max(0, (end - start) / 60000);
}

/** Minutes covered by at least one entry, so two technicians working at the same time count once. */
export function jobMinutes(entries: TimeEntry[], now: Date = new Date()): number {
  const spans = entries
    .map((e) => [new Date(e.startedAt).getTime(), e.endedAt ? new Date(e.endedAt).getTime() : now.getTime()])
    .filter(([start, end]) => end > start)
    .sort((a, b) => a[0] - b[0]);
  let total = 0;
  let [curStart, curEnd] = spans[0] ?? [0, 0];
  for (const [start, end] of spans.slice(1)) {
    if (start > curEnd) {
      total += curEnd - curStart;
      [curStart, curEnd] = [start, end];
    } else curEnd = Math.max(curEnd, end);
  }
  total += curEnd - curStart;
  return total / 60000;
}

/** Rounds worked time up to the rounding increment, then applies the minimum. */
export function billableMinutes(workedMinutes: number, rules: BillingRules): number {
  if (workedMinutes <= 0) return 0;
  // Ignore floating-point dust so 30.0000001 minutes doesn't round to the next block.
  const worked = Math.round(workedMinutes * 1000) / 1000;
  const step = rules.roundingMinutes > 0 ? rules.roundingMinutes : 1;
  const rounded = Math.ceil(worked / step) * step;
  return Math.max(rounded, rules.minimumMinutes);
}

export function computeTotals(
  entries: TimeEntry[],
  parts: PartLine[],
  rules: BillingRules,
  depositCents = 0,
  now: Date = new Date(),
): TicketTotals {
  const workedMinutes = entries.reduce((sum, e) => sum + entryMinutes(e, now), 0);
  const clientMinutes = jobMinutes(entries, now);
  const billable = billableMinutes(clientMinutes, rules);
  const laborCents = Math.round((billable / 60) * rules.hourlyRateCents);
  const materialsCents = parts.reduce(
    (sum, p) => sum + Math.round(p.qty * p.unitPriceCents),
    0,
  );
  const taxable = materialsCents + (rules.taxLabor ? laborCents : 0);
  const taxCents = Math.round((taxable * rules.taxRatePct) / 100);
  const totalCents = laborCents + materialsCents + taxCents;
  return {
    workedMinutes,
    jobMinutes: clientMinutes,
    billableMinutes: billable,
    laborCents,
    materialsCents,
    taxCents,
    totalCents,
    depositCents,
    balanceDueCents: totalCents - depositCents,
  };
}

/** Jobs for Swiftnet IT itself: the time stays on record, but nothing is billed or counted as money made. */
export function notBilled(totals: TicketTotals): TicketTotals {
  return { ...totals, billableMinutes: 0, laborCents: 0, materialsCents: 0, taxCents: 0, totalCents: 0, depositCents: 0, balanceDueCents: 0 };
}

export function formatMoney(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

/** "1 h 15 min" */
export function formatMinutes(minutes: number): string {
  const m = Math.round(minutes);
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest} min`;
  return rest === 0 ? `${h} h` : `${h} h ${rest} min`;
}

/** "2 hours" for whole hours, otherwise "1 h 15 min". Used on the customer's ticket. */
export function formatHours(minutes: number): string {
  const m = Math.round(minutes);
  if (m % 60 !== 0) return formatMinutes(m);
  const h = m / 60;
  return h === 1 ? "1 hour" : `${h} hours`;
}

/** Parses "12.50" or "$1,200" into cents. Returns 0 for blank or invalid input. */
export function parseMoney(input: string | null | undefined): number {
  if (!input) return 0;
  const n = Number(String(input).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
