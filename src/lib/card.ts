/**
 * Credit card usage, kept apart from Expenses: statements and their lines are stored in their own tables and never
 * count toward expense totals. Money is in cents; a charge is positive, a payment or refund is negative.
 */

export const CARD_CATEGORIES = [
  "Parts and equipment",
  "Software and subscriptions",
  "Travel",
  "Fuel",
  "Shipping",
  "Company lunch",
  "Company dinner",
  "Entertainment",
  "Customer incentives",
  "Customer cybersecurity subscriptions",
  "Research and development",
  "Government taxes",
  "Health insurance",
  "Car insurance",
  "Automobile parts",
  "Local purchases",
  "To review",
  "Other",
] as const;

/** A line marked to look at again. It shows as a warning on the month, and is never learned for next time. */
export const REVIEW_CATEGORY = "To review";
export type CardCategory = (typeof CARD_CATEGORIES)[number];
/** Payments to the card and refunds. They're shown apart from spending. */
export const PAYMENT_CATEGORY = "Payment";

export type CardStatement = {
  id: string;
  card_name: string;
  statement_month: string; // "YYYY-MM": the month the spending is for
  statement_date: string;
  due_date: string | null;
  credit_limit_cents: number;
  previous_balance_cents: number;
  charges_cents: number;
  credits_cents: number;
  new_balance_cents: number;
  minimum_due_cents: number;
  /** AAdvantage miles as printed on this statement ("Miles earned on previous month statement"); null if not entered. */
  miles_earned: number | null;
  notes: string;
};

export type CardLine = {
  id: string;
  statement_id: string;
  posted_on: string;
  reference: string;
  merchant: string;
  category: string;
  amount_cents: number;
  notes: string;
};

const RULES: [RegExp, CardCategory | typeof PAYMENT_CATEGORY][] = [
  [/thank you for your payment|payment received|^payment\b|refund|reversal|credit adj/i, PAYMENT_CATEGORY],
  [/amazon|newegg|b&h|bhphoto|ubiquiti|ui\.com|cdw|monoprice|dell|lenovo|best ?buy/i, "Parts and equipment"],
  [/ninjaone|anthropic|claude|openai|chatgpt|askgpt|smartdraw|starlink|network ?solutions|godaddy|namecheap|msft|microsoft|google|adobe|dropbox|zoom|apple\.com|icloud|github|cloudflare|vercel|supabase|netlify/i, "Software and subscriptions"],
  [/arajet|airline|airways|american air|jetblue|delta|united|winair|insel|caribbean air|copa|expedia|booking\.com|hotel|airbnb|hertz|avis|budget rent/i, "Travel"],
  [/gas station|risdon|\bgas\b|fuel|petrol|shell|texaco|esso|sol\b/i, "Fuel"],
  [/cargo|shipping|courier|fedex|ups\b|dhl|usps|aeropost|mail ?box/i, "Shipping"],
  [/restaurant|resto\b|cafe|café|coffee|starbucks|bakery|bistro|grill|pizza|burger|kfc|mcdonald|subway|domino|sushi|bar & |\bbar\b|diner|kitchen|uber ?eats|doordash/i, "Company lunch"],
  [/netflix|spotify|disney|hulu|hbo|max\.com|youtube|prime video|apple ?tv|playstation|xbox|nintendo|steam|cinema|movie|theater|theatre|ticketmaster|casino|concert|event/i, "Entertainment"],
  [/\bsxm\b|st maarten|sint maarten|philipsburg|kooyman|ace hardware/i, "Local purchases"],
];

/** Picks a category from the merchant name on the statement. Restaurants start as "Company lunch"; switch a dinner by hand. */
export function categorize(merchant: string, amountCents = 1): string {
  if (amountCents < 0) return PAYMENT_CATEGORY;
  for (const [re, category] of RULES) if (re.test(merchant)) return category;
  return "Other";
}

/**
 * A merchant name without its order numbers and codes, so "AMAZON MKTPL*590RD8T50 SEATTLE WA" and
 * "AMAZON MKTPL*1L35A7EC3 SEATTLE WA" are the same merchant.
 */
export function merchantPattern(merchant: string): string {
  return merchant
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.split("*")[0])
    .filter((w) => w && !/\d/.test(w))
    .join(" ");
}

/** What was learned from saved statements: each merchant's category as last picked. Payments aren't learned. */
export type Learned = Record<string, string>;

/** Builds what was learned from saved lines, oldest first, so the latest choice for a merchant wins. */
export function learnFrom(lines: { merchant: string; category: string; amount_cents: number }[]): Learned {
  const learned: Learned = {};
  for (const l of lines) {
    if (l.amount_cents <= 0 || l.category === PAYMENT_CATEGORY || l.category === REVIEW_CATEGORY) continue;
    const key = merchantPattern(l.merchant);
    if (key) learned[key] = l.category;
  }
  return learned;
}

/** The category for a line: the one picked before for the same merchant, otherwise the built-in guess. */
export function pickCategory(merchant: string, amountCents: number, learned: Learned = {}): string {
  if (amountCents < 0) return PAYMENT_CATEGORY;
  return learned[merchantPattern(merchant)] ?? categorize(merchant, amountCents);
}

/** The first word of a merchant name, so "ASKGPT.APP LIMASSOL" and "ASKGPT AI CHAT" are the same company. */
export function merchantKey(merchant: string): string {
  const first = merchant.trim().toLowerCase().match(/[a-z0-9]+/);
  return first ? first[0] : "";
}

export type DuplicateFlag = { key: string; lines: CardLine[]; differentNames: boolean };

/** Subscriptions billed more than once in the same statement, which may mean paying twice for one service. */
export function possibleDuplicates(lines: CardLine[]): DuplicateFlag[] {
  const groups = new Map<string, CardLine[]>();
  for (const line of lines) {
    if (line.category !== "Software and subscriptions" || line.amount_cents <= 0) continue;
    const key = merchantKey(line.merchant);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), line]);
  }
  return [...groups.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([key, group]) => ({ key, lines: group, differentNames: new Set(group.map((l) => l.merchant.trim().toUpperCase())).size > 1 }));
}

export type CategoryTotal = { category: string; cents: number; count: number; lines: CardLine[] };

/** Spending per category, largest first. Payments are left out. */
export function byCategory(lines: CardLine[]): CategoryTotal[] {
  const totals = new Map<string, CategoryTotal>();
  for (const line of lines) {
    if (line.category === PAYMENT_CATEGORY) continue;
    const t = totals.get(line.category) ?? { category: line.category, cents: 0, count: 0, lines: [] };
    t.cents += line.amount_cents;
    t.count += 1;
    t.lines.push(line);
    totals.set(line.category, t);
  }
  return [...totals.values()].sort((a, b) => b.cents - a.cents);
}

/** AAdvantage miles the card earns per dollar charged (October 2026: 5,149 miles printed for about $5,140). */
export const MILES_PER_DOLLAR = 1;

/** Miles expected from a month's charges. The bank confirms them on the next statement. */
export function estimateMiles(chargesCents: number): number {
  return Math.max(0, Math.floor((chargesCents / 100) * MILES_PER_DOLLAR));
}

/** "2026-10" → "October 2026". */
export function monthLabel(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** The month a statement's spending is for: the month before the statement date, since a statement closes early in the next month. */
export function monthForStatementDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m) return "";
  return new Date(Date.UTC(y, d && d > 20 ? m - 1 : m - 2, 1)).toISOString().slice(0, 7);
}

export type WarningKind = "math" | "double" | "subscription" | "fee" | "foreign" | "large" | "uncategorized" | "spending" | "limit" | "empty" | "review";
/** `label` is the short badge shown on the collapsed month; `text` is the full detail. */
export type Warning = { level: "alert" | "check"; kind: WarningKind; label: string; text: string };

const usd = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const shortDay = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const daysApart = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;

/** A charge this big is worth a second look. */
export const LARGE_CHARGE_CENTS = 100_000;
const FEE = /\bfee\b|interest|finance charge/i;
const FOREIGN = /\b(COP|EUR|GBP|ANG|XCG|NAF|DOP|MXN|CAD|BRL|JPY|CNY)\b|billed as/i;

/**
 * Everything on a statement worth reviewing: totals that don't add up, double charges or subscriptions, fees and
 * interest, foreign currency, large charges, uncategorized lines, and spending well above the other months.
 * `otherMonths` are the charges of the other saved statements, to compare against.
 */
export function statementWarnings(s: CardStatement, lines: CardLine[], otherMonths: number[] = []): Warning[] {
  const out: Warning[] = [];
  const charges = lines.filter((l) => l.amount_cents > 0 && l.category !== PAYMENT_CATEGORY);

  // The statement's own arithmetic, and the lines against the printed totals.
  const expected = s.previous_balance_cents + s.charges_cents - s.credits_cents;
  if ((s.previous_balance_cents || s.new_balance_cents) && Math.abs(expected - s.new_balance_cents) > 1) {
    out.push({ level: "alert", kind: "math", label: "Balance doesn't add up", text: `Balance doesn't add up: ${usd(s.previous_balance_cents)} + ${usd(s.charges_cents)} - ${usd(s.credits_cents)} = ${usd(expected)}, but the statement says ${usd(s.new_balance_cents)}. Possible interest or fees.` });
  }
  if (lines.length) {
    const lineCharges = lines.filter((l) => l.amount_cents > 0).reduce((t, l) => t + l.amount_cents, 0);
    const lineCredits = -lines.filter((l) => l.amount_cents < 0).reduce((t, l) => t + l.amount_cents, 0);
    if (lineCharges !== s.charges_cents) out.push({ level: "alert", kind: "math", label: "Charges don't match", text: `The lines add up to ${usd(lineCharges)} in charges, but the statement says ${usd(s.charges_cents)}. A line may be missing or misread.` });
    if (lineCredits !== s.credits_cents) out.push({ level: "alert", kind: "math", label: "Credits don't match", text: `The lines add up to ${usd(lineCredits)} in credits, but the statement says ${usd(s.credits_cents)}.` });
  } else {
    out.push({ level: "check", kind: "empty", label: "No lines", text: "No lines saved for this statement." });
  }

  // The same charge twice: same merchant and amount within 3 days.
  const seen: CardLine[] = [];
  for (const l of charges) {
    const twin = seen.find((o) => o.amount_cents === l.amount_cents && merchantPattern(o.merchant) === merchantPattern(l.merchant) && daysApart(o.posted_on, l.posted_on) <= 3);
    if (twin) out.push({ level: "alert", kind: "double", label: `Double charge ${merchantKey(l.merchant).toUpperCase()}`, text: `Possible double charge: ${l.merchant} ${usd(l.amount_cents)} on ${shortDay(twin.posted_on)} and ${shortDay(l.posted_on)}.` });
    seen.push(l);
  }

  for (const f of possibleDuplicates(lines)) {
    const list = f.lines.map((l) => `${usd(l.amount_cents)} on ${shortDay(l.posted_on)}`).join(", ");
    out.push({
      level: f.differentNames ? "alert" : "check",
      kind: "subscription",
      label: `${f.differentNames ? "Two accounts" : "Repeat subscription"} ${f.key.toUpperCase()}`,
      text: `${f.lines.length} subscription charges from ${f.key.toUpperCase()} (${list})${f.differentNames ? ", under different merchant names: you may be paying for two accounts" : ": check it isn't billed twice"}.`,
    });
  }

  for (const l of charges.filter((l) => FEE.test(l.merchant))) out.push({ level: "alert", kind: "fee", label: `Fee ${usd(l.amount_cents)}`, text: `Bank fee or interest: ${l.merchant} ${usd(l.amount_cents)}.` });
  for (const l of charges.filter((l) => FOREIGN.test(l.notes) || FOREIGN.test(l.merchant))) {
    out.push({ level: "check", kind: "foreign", label: `Foreign ${merchantKey(l.merchant).toUpperCase()}`, text: `Foreign currency: ${l.merchant} ${usd(l.amount_cents)}${l.notes ? ` (${l.notes})` : ""}. Check the rate and any fee.` });
  }
  for (const l of charges.filter((l) => l.amount_cents >= LARGE_CHARGE_CENTS)) out.push({ level: "check", kind: "large", label: `Large ${usd(l.amount_cents)}`, text: `Large charge: ${l.merchant} ${usd(l.amount_cents)} on ${shortDay(l.posted_on)}.` });

  // Lines marked "To review" by hand come first: they were picked on purpose.
  const review = lines.filter((l) => l.category === REVIEW_CATEGORY);
  if (review.length) {
    out.unshift({
      level: "alert",
      kind: "review",
      label: `${review.length} to review`,
      text: `Marked to review: ${review.map((l) => `${l.merchant} ${usd(l.amount_cents)} on ${shortDay(l.posted_on)}`).join("; ")}.`,
    });
  }

  const other = charges.filter((l) => l.category === "Other");
  if (other.length) out.push({ level: "check", kind: "uncategorized", label: `${other.length} uncategorized`, text: `${other.length} ${other.length === 1 ? "charge has" : "charges have"} no category yet (${usd(other.reduce((t, l) => t + l.amount_cents, 0))}).` });

  const others = otherMonths.filter((c) => c > 0);
  if (others.length >= 2) {
    const avg = others.reduce((t, c) => t + c, 0) / others.length;
    if (s.charges_cents > avg * 1.5) out.push({ level: "check", kind: "spending", label: `Spending +${Math.round((s.charges_cents / avg - 1) * 100)}%`, text: `Spending is ${Math.round((s.charges_cents / avg - 1) * 100)}% above your average month (${usd(Math.round(avg))}).` });
  }

  if (s.credit_limit_cents && s.new_balance_cents > s.credit_limit_cents * 0.9) out.push({ level: "alert", kind: "limit", label: "Near limit", text: `Balance is over 90% of the ${usd(s.credit_limit_cents)} limit.` });

  return out;
}
