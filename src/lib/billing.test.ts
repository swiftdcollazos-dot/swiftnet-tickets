import { describe, expect, it } from "vitest";
import { billableMinutes, computeTotals, formatMinutes, parseMoney, type BillingRules } from "./billing";

const rules: BillingRules = {
  hourlyRateCents: 9000,
  taxRatePct: 0,
  taxLabor: true,
  roundingMinutes: 15,
  minimumMinutes: 0,
};

const at = (hhmm: string) => `2026-10-09T${hhmm}:00Z`;

describe("billableMinutes", () => {
  it("rounds up to the next 15 minutes", () => {
    expect(billableMinutes(61, rules)).toBe(75);
    expect(billableMinutes(60, rules)).toBe(60);
    expect(billableMinutes(1, rules)).toBe(15);
  });
  it("applies the minimum charge", () => {
    expect(billableMinutes(20, { ...rules, minimumMinutes: 60 })).toBe(60);
  });
  it("bills nothing when no time was worked", () => {
    expect(billableMinutes(0, { ...rules, minimumMinutes: 60 })).toBe(0);
  });
});

describe("computeTotals", () => {
  it("charges $90 an hour for labor", () => {
    const t = computeTotals([{ startedAt: at("09:00"), endedAt: at("10:30") }], [], rules);
    expect(t.billableMinutes).toBe(90);
    expect(t.laborCents).toBe(13500);
    expect(t.totalCents).toBe(13500);
  });

  it("adds up several visits and parts, then subtracts the deposit", () => {
    const t = computeTotals(
      [
        { startedAt: at("09:00"), endedAt: at("09:40") },
        { startedAt: at("14:00"), endedAt: at("14:25") },
      ],
      [
        { qty: 2, unitPriceCents: 1250 },
        { qty: 1, unitPriceCents: 4999 },
      ],
      rules,
      5000,
    );
    expect(t.workedMinutes).toBe(65);
    expect(t.billableMinutes).toBe(75); // 65 rounds up to 75
    expect(t.laborCents).toBe(11250);
    expect(t.materialsCents).toBe(7499);
    expect(t.totalCents).toBe(18749);
    expect(t.balanceDueCents).toBe(13749);
  });

  it("can tax materials only", () => {
    const t = computeTotals(
      [{ startedAt: at("09:00"), endedAt: at("10:00") }],
      [{ qty: 1, unitPriceCents: 10000 }],
      { ...rules, taxRatePct: 5, taxLabor: false },
    );
    expect(t.taxCents).toBe(500);
    expect(t.totalCents).toBe(9000 + 10000 + 500);
  });

  it("can tax labor and materials", () => {
    const t = computeTotals(
      [{ startedAt: at("09:00"), endedAt: at("10:00") }],
      [{ qty: 1, unitPriceCents: 10000 }],
      { ...rules, taxRatePct: 5, taxLabor: true },
    );
    expect(t.taxCents).toBe(950);
  });

  it("counts a running timer up to now", () => {
    const t = computeTotals([{ startedAt: at("09:00"), endedAt: null }], [], rules, 0, new Date(at("09:50")));
    expect(t.workedMinutes).toBe(50);
    expect(t.billableMinutes).toBe(60);
  });
});

describe("formatting", () => {
  it("formats durations", () => {
    expect(formatMinutes(75)).toBe("1 h 15 min");
    expect(formatMinutes(45)).toBe("45 min");
    expect(formatMinutes(120)).toBe("2 h");
  });
  it("parses money input", () => {
    expect(parseMoney("$1,200.50")).toBe(120050);
    expect(parseMoney("")).toBe(0);
    expect(parseMoney("abc")).toBe(0);
  });
});

import { localToIso, todayLocal, formatDate } from "./time";

describe("Saint Martin time", () => {
  it("reads form times as local (UTC-4)", () => {
    expect(localToIso("2026-10-09", "14:30")).toBe("2026-10-09T18:30:00.000Z");
  });
  it("uses the local date late in the evening", () => {
    expect(todayLocal(new Date("2026-10-10T02:00:00Z"))).toBe("2026-10-09");
  });
  it("does not shift plain dates", () => {
    expect(formatDate("2026-10-09")).toBe("Oct 9, 2026");
  });
});
