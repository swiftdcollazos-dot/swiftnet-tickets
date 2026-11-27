"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveCardStatement, scanCardStatement, setCardLineCategory, type CardStatementInput } from "@/app/actions";
import { CARD_CATEGORIES, PAYMENT_CATEGORY, categorize, monthForStatementDate } from "@/lib/card";
import { pdfToJpeg } from "@/lib/pdf-to-image";

const PDF_MAX_BYTES = 2_000_000;
const ALL_CATEGORIES = [...CARD_CATEGORIES, PAYMENT_CATEGORY];
type Line = CardStatementInput["lines"][number] & { key: number };

let nextKey = 1;
const blankLine = (l?: Partial<Line>): Line => ({ posted_on: "", reference: "", merchant: "", amount: "", category: "Other", notes: "", ...l, key: nextKey++ });
const toCents = (s: string) => Math.round((Number(s.replace(/[$,\s]/g, "")) || 0) * 100);
const show = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const money = (n: number) => (n ? n.toFixed(2) : "");

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Add a month: upload the bank's statement PDF to fill everything in, or type it in. Saving the same month again replaces it. */
export function StatementForm({ cardName }: { cardName: string }) {
  const router = useRouter();
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"" | "reading" | "saving">("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [v, setV] = useState({
    card_name: cardName, statement_month: "", statement_date: "", due_date: "", credit_limit: "",
    previous_balance: "", charges: "", credits: "", new_balance: "", minimum_due: "",
  });
  const [lines, setLines] = useState<Line[]>([]);
  const set = (key: keyof typeof v) => (e: { target: { value: string } }) =>
    setV((old) => {
      const next = { ...old, [key]: e.target.value };
      if (key === "statement_date" && !old.statement_month) next.statement_month = monthForStatementDate(e.target.value);
      return next;
    });
  const setLine = (key: number, field: keyof Line) => (e: { target: { value: string } }) =>
    setLines((ls) => ls.map((l) => {
      if (l.key !== key) return l;
      const next = { ...l, [field]: e.target.value };
      // A new merchant or a sign change picks the category again, until it's picked by hand.
      if ((field === "merchant" || field === "amount") && l.category === categorize(l.merchant, toCents(l.amount))) next.category = categorize(next.merchant, toCents(next.amount));
      return next;
    }));

  async function onFile(f: File | undefined) {
    if (!f) return;
    setMessage(null);
    setBusy("reading");
    try {
      const isPdf = f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
      const dataUrl = isPdf && f.size <= PDF_MAX_BYTES
        ? (await readAsDataUrl(f)).replace(/^data:[^;]*;/, "data:application/pdf;")
        : isPdf ? (await pdfToJpeg(f)).dataUrl : (await readAsDataUrl(f));
      if (!isPdf && !dataUrl.startsWith("data:image/jpeg")) {
        setMessage({ ok: false, text: "Please upload the statement as a PDF or a JPEG photo." });
        return;
      }
      const r = await scanCardStatement(dataUrl);
      if ("error" in r) {
        setMessage({ ok: false, text: r.error });
        return;
      }
      setV({
        // Keep the card's existing name so the same month is replaced, not added twice.
        card_name: cardName || r.card_name,
        statement_month: monthForStatementDate(r.statement_date),
        statement_date: r.statement_date,
        due_date: r.due_date,
        credit_limit: money(r.credit_limit),
        previous_balance: money(r.previous_balance),
        charges: money(r.charges),
        credits: money(r.credits),
        new_balance: money(r.new_balance),
        minimum_due: money(r.minimum_due),
      });
      setLines(r.lines.map((l) => blankLine({ ...l, amount: l.amount.toFixed(2) })));
      setMessage({ ok: true, text: `Read ${r.lines.length} lines from the statement. Please check them, then Save.` });
    } catch {
      setMessage({ ok: false, text: "That file couldn't be read. Please try another, or enter it by hand." });
    } finally {
      setBusy("");
      if (file.current) file.current.value = "";
    }
  }

  async function save() {
    setBusy("saving");
    setMessage(null);
    const r = await saveCardStatement({ ...v, lines: lines.map((l) => ({ posted_on: l.posted_on, reference: l.reference, merchant: l.merchant, amount: l.amount, category: l.category, notes: l.notes })) });
    setBusy("");
    if ("error" in r) setMessage({ ok: false, text: r.error });
    else {
      setLines([]);
      setV((old) => ({ ...old, statement_month: "", statement_date: "", due_date: "", previous_balance: "", charges: "", credits: "", new_balance: "", minimum_due: "" }));
      setMessage({ ok: true, text: "Saved." });
      router.refresh();
    }
  }

  const lineCharges = lines.reduce((s, l) => s + Math.max(0, toCents(l.amount)), 0);
  const lineCredits = -lines.reduce((s, l) => s + Math.min(0, toCents(l.amount)), 0);
  const mismatch = lines.length > 0 && ((v.charges && toCents(v.charges) !== lineCharges) || (v.credits && toCents(v.credits) !== lineCredits));

  const field = (key: keyof typeof v, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label className="label label-money" htmlFor={`st-${key}`}>{label}</label>
      <input className="input" id={`st-${key}`} value={v[key]} onChange={set(key)} inputMode="decimal" {...props} />
    </div>
  );

  return (
    <div className="space-y-3">
      <input ref={file} type="file" accept="application/pdf,image/jpeg" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      <button type="button" className="btn w-full" disabled={!!busy} onClick={() => file.current?.click()}>
        📎 {busy === "reading" ? "Reading statement…" : "Upload statement PDF"}
      </button>
      <p className="text-center text-xs text-slate-500">or type it in below</p>

      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2">
          <label className="label label-who" htmlFor="st-card">Card</label>
          <input className="input" id="st-card" value={v.card_name} onChange={set("card_name")} placeholder="e.g. WIB card ending 9123" />
        </div>
        <div>
          <label className="label label-when" htmlFor="st-statement_date">Statement date</label>
          <input className="input" type="date" id="st-statement_date" value={v.statement_date} onChange={set("statement_date")} />
        </div>
        <div>
          <label className="label label-when" htmlFor="st-statement_month">Spending for</label>
          <input className="input" type="month" id="st-statement_month" value={v.statement_month} onChange={set("statement_month")} />
        </div>
        {field("previous_balance", "Previous balance ($)")}
        {field("new_balance", "New balance ($)")}
        {field("charges", "Total charges ($)", { placeholder: lines.length ? (lineCharges / 100).toFixed(2) : "" })}
        {field("credits", "Total credits ($)", { placeholder: lines.length ? (lineCredits / 100).toFixed(2) : "" })}
        {field("minimum_due", "Minimum payment ($)")}
        <div>
          <label className="label label-when" htmlFor="st-due_date">Payment due</label>
          <input className="input" type="date" id="st-due_date" value={v.due_date} onChange={set("due_date")} />
        </div>
        {field("credit_limit", "Credit limit ($)")}
      </div>

      <div>
        <p className="label">Lines ({lines.length})</p>
        <ul className="space-y-2">
          {lines.map((l) => (
            <li key={l.key} className="grid grid-cols-6 gap-1 rounded-lg border border-slate-200 p-2">
              <input className="input col-span-2 text-sm" type="date" aria-label="Date" value={l.posted_on} onChange={setLine(l.key, "posted_on")} />
              <input className="input col-span-4 text-sm" aria-label="Merchant" placeholder="Merchant" value={l.merchant} onChange={setLine(l.key, "merchant")} />
              <input className="input col-span-2 text-sm" inputMode="decimal" aria-label="Amount" placeholder="Amount ($)" value={l.amount} onChange={setLine(l.key, "amount")} />
              <select className="input col-span-3 text-sm" aria-label="Category" value={l.category} onChange={setLine(l.key, "category")}>
                {ALL_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
              <button type="button" className="btn-light col-span-1 text-sm" aria-label="Remove line" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>✕</button>
            </li>
          ))}
        </ul>
        <button type="button" className="btn-light mt-2 w-full" onClick={() => setLines((ls) => [...ls, blankLine()])}>+ Add line</button>
        <p className="mt-1 text-xs text-slate-500">Use a minus sign for payments and refunds, e.g. -1321.00.</p>
        {lines.length > 0 && (
          <p className={`mt-1 text-sm ${mismatch ? "font-semibold text-red-700" : "text-slate-600"}`}>
            Lines add up to {show(lineCharges)} charges and {show(lineCredits)} credits{mismatch ? ", which doesn't match the totals above." : "."}
          </p>
        )}
      </div>

      {message && <p className={`text-sm ${message.ok ? "text-green-700" : "text-red-700"}`}>{message.text}</p>}
      <button type="button" className="btn w-full" disabled={!!busy} onClick={save}>{busy === "saving" ? "Saving…" : "Save statement"}</button>
    </div>
  );
}

/** Changes one line's category right away. */
export function CategorySelect({ id, category }: { id: string; category: string }) {
  const [pending, start] = useTransition();
  return (
    <select
      className="rounded border border-slate-200 bg-white px-1 py-0.5 text-xs text-slate-600"
      aria-label="Category"
      defaultValue={category}
      disabled={pending}
      onChange={(e) => {
        const value = e.target.value;
        start(() => setCardLineCategory(id, value));
      }}
    >
      {ALL_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
    </select>
  );
}
