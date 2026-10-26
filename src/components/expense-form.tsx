"use client";

import { useRef, useState } from "react";
import { scanReceipt } from "@/app/actions";
import { EXPENSE_CATEGORIES, PAYMENT_METHODS, type Expense } from "@/lib/types";

/** Shrinks a photo to at most 1600 px on its long side and returns it as a JPEG data URL. */
async function compress(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.75);
}

const dollars = (cents: number) => (cents ? (cents / 100).toFixed(2) : "");

type Values = { spent_on: string; vendor: string; category: string; description: string; amount: string; tax: string; payment_method: string };

/** Add or edit an expense. "Scan receipt" takes a photo and fills in the fields for you to check. */
export function ExpenseForm({
  expense,
  today,
  save,
}: {
  expense?: Expense;
  today: string;
  save: (form: FormData) => Promise<void>;
}) {
  const [values, setValues] = useState<Values>({
    spent_on: expense?.spent_on ?? today,
    vendor: expense?.vendor ?? "",
    category: expense?.category ?? "Other",
    description: expense?.description ?? "",
    amount: dollars(expense?.amount_cents ?? 0),
    tax: dollars(expense?.tax_cents ?? 0),
    payment_method: expense?.payment_method ?? "",
  });
  // "keep" leaves the saved photo alone; "" removes it; a data URL replaces it.
  const [receipt, setReceipt] = useState(expense?.receipt ? "keep" : "");
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);

  const set = (key: keyof Values) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [key]: e.target.value }));
  const preview = receipt === "keep" ? expense?.receipt : receipt;

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setMessage(null);
    setScanning(true);
    try {
      const dataUrl = await compress(file);
      setReceipt(dataUrl);
      const result = await scanReceipt(dataUrl);
      if ("error" in result) {
        setMessage({ ok: false, text: result.error });
      } else {
        setValues((v) => ({
          spent_on: result.date || v.spent_on,
          vendor: result.vendor || v.vendor,
          category: result.category || v.category,
          description: result.description || v.description,
          amount: result.total ? result.total.toFixed(2) : v.amount,
          tax: result.tax ? result.tax.toFixed(2) : v.tax,
          payment_method: result.payment_method || v.payment_method,
        }));
        setMessage({ ok: true, text: "Filled in from the receipt. Please check it, then Save." });
      }
    } catch {
      setMessage({ ok: false, text: "That photo couldn't be read. Please try another." });
    } finally {
      setScanning(false);
    }
  }

  return (
    <form action={save} className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="btn" disabled={scanning} onClick={() => camera.current?.click()}>
          📷 {scanning ? "Reading receipt…" : "Scan receipt"}
        </button>
        <button type="button" className="btn-light" disabled={scanning} onClick={() => library.current?.click()}>
          Choose a photo
        </button>
      </div>
      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onPhoto(e.target.files?.[0])} />
      <input ref={library} type="file" accept="image/*" className="hidden" onChange={(e) => onPhoto(e.target.files?.[0])} />
      {message && <p className={`rounded-lg p-2 text-sm ${message.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>{message.text}</p>}

      {preview && (
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- a data URL, nothing for next/image to optimize */}
          <img src={preview} alt="Receipt" className="max-h-40 rounded border border-slate-200" />
          <button type="button" className="text-sm text-red-600 underline" onClick={() => setReceipt("")}>
            Remove photo
          </button>
        </div>
      )}
      <input type="hidden" name="receipt" value={receipt} />

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label" htmlFor="spent_on">Date</label>
          <input className="input" type="date" id="spent_on" name="spent_on" value={values.spent_on} onChange={set("spent_on")} required />
        </div>
        <div>
          <label className="label" htmlFor="amount">Total ($)</label>
          <input className="input" inputMode="decimal" id="amount" name="amount" value={values.amount} onChange={set("amount")} required />
        </div>
        <div className="col-span-2">
          <label className="label" htmlFor="vendor">Paid to</label>
          <input className="input" id="vendor" name="vendor" value={values.vendor} onChange={set("vendor")} placeholder="Store or company" required />
        </div>
        <div>
          <label className="label" htmlFor="category">Category</label>
          <select className="input" id="category" name="category" value={values.category} onChange={set("category")}>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="tax">Tax ($)</label>
          <input className="input" inputMode="decimal" id="tax" name="tax" value={values.tax} onChange={set("tax")} />
        </div>
        <div>
          <label className="label" htmlFor="payment_method">Paid with</label>
          <select className="input" id="payment_method" name="payment_method" value={values.payment_method} onChange={set("payment_method")}>
            <option value="">—</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </div>
        <div className="col-span-2">
          <label className="label" htmlFor="description">What was bought</label>
          <textarea className="input" id="description" name="description" rows={2} value={values.description} onChange={set("description")} />
        </div>
      </div>
      <button className="btn w-full" disabled={scanning}>
        Save expense
      </button>
    </form>
  );
}

export function DeleteExpenseButton({ remove }: { remove: () => Promise<void> }) {
  return (
    <form
      action={remove}
      className="flex justify-center"
      onSubmit={(e) => {
        if (!confirm("Delete this expense and its receipt photo? This can't be undone.")) e.preventDefault();
      }}
    >
      <button className="btn-danger px-6">Delete expense</button>
    </form>
  );
}
