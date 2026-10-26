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
};

const SCHEMA = {
  type: "object",
  properties: {
    is_receipt: { type: "boolean", description: "False if the photo is not a receipt or invoice, or is unreadable." },
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
  required: ["is_receipt", "vendor", "date", "total", "tax", "category", "payment_method", "description", "items"],
  additionalProperties: false,
};

const PROMPT = `This is a photo of a receipt for Swiftnet I.T., a small IT services company. Read it and fill in the expense fields.
Pick the category that fits best for an IT company (cables, switches, computers and spare parts are "Parts and hardware"; gas, tolls and car repairs are "Fuel and vehicle").
Use payment_method "Cash" when cash or change is shown; otherwise leave it empty, since the person picks which card or account was used.
If a year is missing or unclear, assume the most recent date that is not after today.`;

/** Reads a receipt photo (a JPEG data URL) with Claude and returns the expense fields, or an error to show. */
export async function scanReceiptImage(dataUrl: string, today: string): Promise<ScannedReceipt | { error: string }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { error: "Receipt scanning isn't set up yet: ANTHROPIC_API_KEY is missing in Vercel." };
  }
  const client = new Anthropic();
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
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: dataUrl.slice(dataUrl.indexOf(",") + 1) } },
          { type: "text", text: `${PROMPT}\nToday is ${today}.` },
        ],
      },
    ],
  });

  if (response.stop_reason === "refusal") return { error: "The receipt couldn't be read. Please fill it in by hand." };
  if (response.stop_reason === "max_tokens") return { error: "The scan was cut off. Please try again." };
  const text = response.content.find((b) => b.type === "text")?.text;
  if (!text) return { error: "The receipt couldn't be read. Please fill it in by hand." };

  const data = JSON.parse(text) as ScannedReceipt & { is_receipt: boolean };
  if (!data.is_receipt) return { error: "That doesn't look like a receipt. Try another photo with the whole receipt in view." };
  return {
    vendor: data.vendor,
    date: /^\d{4}-\d{2}-\d{2}$/.test(data.date) ? data.date : "",
    total: data.total,
    tax: data.tax,
    category: data.category,
    payment_method: data.payment_method,
    description: data.description,
    items: (data.items ?? []).filter((it) => it.description && it.amount > 0),
  };
}
