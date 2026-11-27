import { describe, expect, it } from "vitest";
import { byCategory, categorize, learnFrom, merchantKey, merchantPattern, pickCategory, monthForStatementDate, possibleDuplicates, statementWarnings, type CardLine, type CardStatement } from "./card";

describe("statementWarnings", () => {
  const st = (over: Partial<CardStatement> = {}): CardStatement => ({
    id: "s", card_name: "", statement_month: "2026-10", statement_date: "2026-11-05", due_date: null, credit_limit_cents: 1_000_000,
    previous_balance_cents: 10000, charges_cents: 5000, credits_cents: 10000, new_balance_cents: 5000, minimum_due_cents: 0, notes: "", miles_earned: null, ...over,
  });
  const at = (merchant: string, cents: number, day = "2026-10-10", notes = "") => ({ ...line(merchant, cents), id: merchant + cents + day, posted_on: day, notes });
  it("is quiet when everything adds up", () => {
    expect(statementWarnings(st(), [at("NINJAONE LLC", 5000), at("THANK YOU FOR YOUR PAYMENT", -10000)])).toEqual([]);
  });
  it("flags totals, double charges, fees, foreign currency and uncategorized lines", () => {
    const w = statementWarnings(st({ new_balance_cents: 6000 }), [
      at("KOOYMAN ST MAARTEN", 1500, "2026-10-10"),
      at("KOOYMAN ST MAARTEN", 1500, "2026-10-11"),
      at("LATE PAYMENT FEE", 1000),
      at("DLO*Starlink Colombia", 500, "2026-10-12", "Billed as COP 266,000.00"),
      at("MYSTERY SHOP", 500),
      at("THANK YOU FOR YOUR PAYMENT", -10000),
    ]).map((x) => x.text);
    expect(w.some((t) => t.startsWith("Balance doesn't add up"))).toBe(true);
    expect(w.some((t) => t.startsWith("Possible double charge: KOOYMAN"))).toBe(true);
    expect(w.some((t) => t.startsWith("Bank fee or interest"))).toBe(true);
    expect(w.some((t) => t.startsWith("Foreign currency: DLO*Starlink"))).toBe(true);
    expect(w.some((t) => t.includes("no category yet"))).toBe(true);
  });
  it("shows lines marked To review first, and never learns that category", () => {
    const w = statementWarnings(st({ charges_cents: 5000 }), [at("ODD SHOP", 5000), at("THANK YOU FOR YOUR PAYMENT", -10000)].map((l) => (l.merchant === "ODD SHOP" ? { ...l, category: "To review" } : l)));
    expect(w[0]).toMatchObject({ kind: "review", label: "1 to review" });
    expect(learnFrom([{ merchant: "ODD SHOP", category: "To review", amount_cents: 5000 }])).toEqual({});
  });
  it("flags a month well above average", () => {
    expect(statementWarnings(st({ charges_cents: 30000, new_balance_cents: 30000, credits_cents: 10000, previous_balance_cents: 10000 }), [], [10000, 10000]).some((x) => x.text.startsWith("Spending is 200% above"))).toBe(true);
  });
});

const line = (merchant: string, cents: number, category = categorize(merchant, cents)): CardLine => ({
  id: merchant + cents, statement_id: "s", posted_on: "2026-10-01", reference: "", merchant, category, amount_cents: cents, notes: "",
});

describe("categorize", () => {
  it("sorts the October 2026 merchants", () => {
    expect(categorize("AMAZON MKTPL*590RD8T50 SEATTLE WA")).toBe("Parts and equipment");
    expect(categorize("AMAZON RETA* 7V2921123 SEATTLE WA")).toBe("Parts and equipment");
    expect(categorize("ANTHROPIC* CLAUDE SUB SAN FRANCISCO CA")).toBe("Software and subscriptions");
    expect(categorize("DLO*Starlink Colombia BOGOTA COL")).toBe("Software and subscriptions");
    expect(categorize("MSFT * E08010O10S REDMOND WA")).toBe("Software and subscriptions");
    expect(categorize("ARAJET S.A. Santo Domingo SD")).toBe("Travel");
    expect(categorize("RISDON'S GAS STATION POINTE BLA SXM")).toBe("Fuel");
    expect(categorize("SAFE AIR CARGO (SXM) PNT BLANCH SXM")).toBe("Shipping");
    expect(categorize("KOOYMAN ST MAARTEN CAYHILL SXM")).toBe("Local purchases");
    expect(categorize("TOP CARROT RESTAURANT SXM")).toBe("Company lunch");
    expect(categorize("NETFLIX.COM LOS GATOS CA")).toBe("Entertainment");
    expect(categorize("THANK YOU FOR YOUR PAYMENT", -513957)).toBe("Payment");
  });
});

describe("possibleDuplicates", () => {
  it("flags two AskGPT charges under different merchant names", () => {
    const flags = possibleDuplicates([line("ASKGPT.APP LIMASSOL NIC", 1999), line("ASKGPT AI CHAT SHERIDAN WY", 2499), line("NINJAONE LLC TAMPA FL", 31000)]);
    expect(flags).toHaveLength(1);
    expect(flags[0].key).toBe("askgpt");
    expect(flags[0].differentNames).toBe(true);
  });
  it("ignores repeat Amazon orders", () => {
    expect(possibleDuplicates([line("AMAZON MKTPL*A", 100), line("AMAZON MKTPL*B", 200)])).toHaveLength(0);
  });
  it("keys merchants by their first word", () => expect(merchantKey("WEB*NETWORKSOLUTIONS")).toBe("web"));
});

describe("byCategory", () => {
  it("leaves out payments and sorts largest first", () => {
    const totals = byCategory([line("AMAZON", 500), line("NINJAONE", 900), line("AMAZON", 600), line("THANK YOU FOR YOUR PAYMENT", -1000)]);
    expect(totals.map((t) => [t.category, t.cents, t.count])).toEqual([["Parts and equipment", 1100, 2], ["Software and subscriptions", 900, 1]]);
  });
});

describe("monthForStatementDate", () => {
  it("a statement closing 5 Nov is October's", () => expect(monthForStatementDate("2026-11-05")).toBe("2026-10"));
  it("a statement closing 28 Oct is October's", () => expect(monthForStatementDate("2026-10-28")).toBe("2026-10"));
});

describe("learning from saved statements", () => {
  it("ignores order numbers in merchant names", () => {
    expect(merchantPattern("AMAZON MKTPL*590RD8T50 SEATTLE WA")).toBe(merchantPattern("AMAZON MKTPL*1L35A7EC3 SEATTLE WA"));
  });
  it("uses the category picked last time for the same merchant", () => {
    const learned = learnFrom([
      { merchant: "KOOYMAN ST MAARTEN CAYHILL SXM", category: "Parts and equipment", amount_cents: 9134 },
      { merchant: "THANK YOU FOR YOUR PAYMENT", category: "Payment", amount_cents: -100 },
    ]);
    expect(pickCategory("KOOYMAN ST MAARTEN CAYHILL SXM", 5000, learned)).toBe("Parts and equipment");
    expect(pickCategory("RISDON'S GAS STATION POINTE BLA SXM", 5000, learned)).toBe("Fuel");
    expect(pickCategory("THANK YOU FOR YOUR PAYMENT", -100, learned)).toBe("Payment");
  });
});
