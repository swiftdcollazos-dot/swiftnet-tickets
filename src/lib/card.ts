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
  "Research and development",
  "Local purchases",
  "Other",
] as const;
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
    if (l.amount_cents <= 0 || l.category === PAYMENT_CATEGORY) continue;
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
