import Anthropic from "@anthropic-ai/sdk";
import { categorize } from "@/lib/card";

/** What a scanned credit card statement fills in. Money is in dollars; payments and refunds are negative. */
export type ScannedStatement = {
  card_name: string;
  statement_date: string;
  due_date: string;
  credit_limit: number;
  previous_balance: number;
  charges: number;
  credits: number;
  new_balance: number;
  minimum_due: number;
  lines: { posted_on: string; reference: string; merchant: string; amount: number; category: string; notes: string }[];
};

const money = { type: "number" };
const SCHEMA = {
  type: "object",
  properties: {
    is_statement: { type: "boolean", description: "False if the file is not a credit card statement, or is unreadable." },
    card_name: { type: "string", description: "Bank and the last 4 digits of the account, e.g. 'WIB card ending 9123'." },
    statement_date: { type: "string", description: "Statement date as YYYY-MM-DD." },
    due_date: { type: "string", description: "Payment due date as YYYY-MM-DD, or empty if not shown." },
    credit_limit: money,
    previous_balance: money,
    charges: { type: "number", description: "Total charges printed on the statement." },
    credits: { type: "number", description: "Total credits (payments and refunds) printed on the statement, as a positive number." },
    new_balance: money,
    minimum_due: { type: "number", description: "Minimum payment due." },
    lines: {
      type: "array",
      description: "Every transaction line, in order. Leave out lines that only add detail to the line above, such as a foreign currency amount; put that in the line's notes instead.",
      items: {
        type: "object",
        properties: {
          posted_on: { type: "string", description: "Transaction date as YYYY-MM-DD. Statements often omit the year: use the year that puts it on or before the statement date." },
          reference: { type: "string" },
          merchant: { type: "string", description: "The description exactly as printed." },
          amount: { type: "number", description: "Positive for a charge; negative for a payment, refund or other credit." },
          notes: { type: "string", description: "Extra detail, e.g. 'Billed as COP 266,000.00'. Empty if none." },
        },
        required: ["posted_on", "reference", "merchant", "amount", "notes"],
        additionalProperties: false,
      },
    },
  },
  required: ["is_statement", "card_name", "statement_date", "due_date", "credit_limit", "previous_balance", "charges", "credits", "new_balance", "minimum_due", "lines"],
  additionalProperties: false,
};

const PROMPT = `This is a monthly credit card statement for Swiftnet I.T., a small IT services company. Read every transaction line on every page and the statement totals. Copy amounts exactly as printed. Note that some banks print the credit limit with a dot as a thousands separator (e.g. "10.000" means 10000).`;

/** Reads a statement PDF or image (a data URL) with Claude, or returns an error to show. Nothing is saved. */
export async function scanStatementFile(dataUrl: string): Promise<ScannedStatement | { error: string }> {
  if (!process.env.ANTHROPIC_API_KEY) return { error: "Statement reading isn't set up yet: ANTHROPIC_API_KEY is missing in Vercel." };
  const client = new Anthropic();
  const data = dataUrl.slice(dataUrl.indexOf(",") + 1);
  // Streamed, since a long statement can take a while and a quiet connection may be cut before the answer comes back.
  const response = await client.beta.messages.stream({
    model: "claude-opus-5-5",
    max_tokens: 16000,
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
          { type: "text", text: PROMPT },
        ],
      },
    ],
  }).finalMessage();
  if (response.stop_reason === "max_tokens") return { error: "The statement was too long to read in one go. Please enter it by hand." };
  const text = response.content.find((b) => b.type === "text")?.text;
  if (response.stop_reason === "refusal" || !text) return { error: "The statement couldn't be read. Please enter it by hand." };
  const scanned = JSON.parse(text) as ScannedStatement & { is_statement: boolean; lines: Omit<ScannedStatement["lines"][number], "category">[] };
  if (!scanned.is_statement) return { error: "That doesn't look like a credit card statement." };
  const day = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "");
  return {
    ...scanned,
    statement_date: day(scanned.statement_date),
    due_date: day(scanned.due_date),
    lines: scanned.lines
      .filter((l) => l.merchant && l.amount)
      .map((l) => ({ ...l, posted_on: day(l.posted_on), category: categorize(l.merchant, l.amount) })),
  };
}
