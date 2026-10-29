import Anthropic from "@anthropic-ai/sdk";
import { EXPENSE_CATEGORIES, PAYMENT_METHODS } from "@/lib/types";

/** What a scanned receipt fills in on the expense form. Money is in dollars, as typed in the form. */
export type ScannedReceipt = {
  vendor: string;
  date: string;
  total: number;
  tax: number;
  category: string;
  payment_method: string;
  description: string;
  items: { description: string; amount: number }[];
  /** Set when the receipt was in guilders: the original total, before converting to dollars. */
  guilders_total?: number;
};

/** Guilders (NAf / ANG / XCG) per US dollar. */
const GUILDERS_PER_DOLLAR = 1.8;
const toDollars = (guilders: number) => Math.round((guilders / GUILDERS_PER_DOLLAR) * 100) / 100;

const SCHEMA = {
  type: "object",
  properties: {
    is_receipt: { type: "boolean", description: "False if the photo or file is not a receipt or invoice, or is unreadable." },
    currency: {
      type: "string",
      enum: ["USD", "NAF"],
      description: "NAF if the amounts are in Netherlands Antillean or Caribbean guilders (NAf, ANG, XCG, Cg, \"guilders\", \"florin\"); otherwise USD.",
    },
    vendor: { type: "string", description: "Store or company that was paid." },
    date: { type: "string", description: "Purchase date as YYYY-MM-DD, or empty if not shown." },
    total: { type: "number", description: "Grand total paid, in dollars, including tax." },
    tax: { type: "number", description: "Sales tax in dollars, 0 if none is shown." },
    category: { type: "string", enum: [...EXPENSE_CATEGORIES] },
    payment_method: { type: "string", enum: [...PAYMENT_METHODS, ""] },
    description: { type: "string", description: "Short summary of what was bought, e.g. '2x Cat6 cable 50ft, RJ45 connectors'." },
    items: {
      type: "array",
      description: "Each line on the receipt, in order. Leave out tax, subtotal, total and payment lines.",
      items: {
        type: "object",
        properties: {
          description: { type: "string", description: "The item with its quantity, e.g. '2x APC BVX 900VA Back-UPS'." },
          amount: { type: "number", description: "The line's total in dollars (quantity times unit price, after any line discount)." },
        },
        required: ["description", "amount"],
        additionalProperties: false,
      },
    },
  },
  required: ["is_receipt", "currency", "vendor", "date", "total", "tax", "category", "payment_method", "description", "items"],
  additionalProperties: false,
};

const PROMPT = `This is a photo or PDF of a receipt or invoice for Swiftnet I.T., a small IT services company. Read it and fill in the expense fields. Copy amounts exactly as printed, in the receipt's own currency.
Pick the category that fits best for an IT company (cables, switches, computers and spare parts are "Parts and hardware"; gas, tolls and car repairs are "Fuel and vehicle"; postage, courier and freight charges are "Shipping"; cell phone plans, phones and phone accessories are "Mobile phone"; internet service bills are "Internet access"; wages, salaries and paychecks are "Payroll"; office or building rent is "Office rent").
Use payment_method "Cash" when cash or change is shown; otherwise leave it empty, since the person picks which card or account was used.
If a year is missing or unclear, assume the most recent date that is not after today.`;

/** Reads a receipt photo or PDF (a JPEG or PDF data URL) with Claude and returns the expense fields, or an error to show. */
export async function scanReceiptImage(dataUrl: string, today: string): Promise<ScannedReceipt | { error: string }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { error: "Receipt scanning isn't set up yet: ANTHROPIC_API_KEY is missing in Vercel." };
  }
  const client = new Anthropic();
  const data = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const response = await client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 4096,
    // If the model declines, the API retries on Anthropic's recommended fallback model.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    messages: [
      {
        role: "user",
        content: [
          dataUrl.startsWith("data:application/pdf")
            ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
            : { type: "image", source: { type: "base64", media_type: "image/jpeg", data } },
          { type: "text", text: `${PROMPT}\nToday is ${today}.` },
        ],
      },
    ],
  });

  if (response.stop_reason === "refusal") return { error: "The receipt couldn't be read. Please fill it in by hand." };
  if (response.stop_reason === "max_tokens") return { error: "The scan was cut off. Please try again." };
  const text = response.content.find((b) => b.type === "text")?.text;
  if (!text) return { error: "The receipt couldn't be read. Please fill it in by hand." };

  const scanned = JSON.parse(text) as ScannedReceipt & { is_receipt: boolean; currency: "USD" | "NAF" };
  if (!scanned.is_receipt) return { error: "That doesn't look like a receipt. Try another photo or file with the whole receipt in view." };
  // Guilder receipts are converted here, not by the model, so the rate is always exact.
  const guilders = scanned.currency === "NAF";
  const money = (n: number) => (guilders ? toDollars(n) : n);
  return {
    ...(guilders ? { guilders_total: scanned.total } : {}),
    vendor: scanned.vendor,
    date: /^\d{4}-\d{2}-\d{2}$/.test(scanned.date) ? scanned.date : "",
    total: money(scanned.total),
    tax: money(scanned.tax),
    category: scanned.category,
    payment_method: scanned.payment_method,
    description: guilders ? `${scanned.description} (NAf ${scanned.total.toFixed(2)} at ${GUILDERS_PER_DOLLAR} per $1)`.trim() : scanned.description,
    items: (scanned.items ?? []).filter((it) => it.description && it.amount > 0).map((it) => ({ ...it, amount: money(it.amount) })),
  };
}
