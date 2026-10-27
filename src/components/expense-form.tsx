"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { scanReceipt } from "@/app/actions";
import { ReceiptView } from "@/components/receipt-view";
import { EXPENSE_CATEGORIES, PAYMENT_METHODS, type Expense, type ExpenseItem } from "@/lib/types";

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

/** Reads a file (a PDF) as a data URL, unchanged. */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** PDFs larger than this can't be sent for scanning or saved. */
const PDF_MAX_BYTES = 2_000_000;

const dollars = (cents: number) => (cents ? (cents / 100).toFixed(2) : "");

type Values = { spent_on: string; vendor: string; category: string; description: string; amount: string; tax: string; payment_method: string };

/** Markups offered when an item is bought to resell to a customer. */
const MARKUPS = [10, 15, 20, 25];

type Item = { key: string; description: string; amount: string; bill_client_id: string; markup_pct: number; charged: boolean };

const blankItem = (description = "", amount = ""): Item => ({
  key: crypto.randomUUID(),
  description,
  amount,
  bill_client_id: "",
  markup_pct: 20,
  charged: false,
});

/** Add or edit an expense. "Scan receipt" takes a photo and fills in the fields for you to check. */
export function ExpenseForm({
  expense,
  items: savedItems = [],
  today,
  clients,
  save,
}: {
  expense?: Expense;
  items?: ExpenseItem[];
  today: string;
  clients: { id: string; name: string }[];
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
  const [items, setItems] = useState<Item[]>(() =>
    savedItems.map((it) => ({
      key: it.id,
      description: it.description,
      amount: dollars(it.amount_cents),
      bill_client_id: it.bill_client_id ?? "",
      markup_pct: it.markup_pct || 20,
      charged: it.charged,
    })),
  );
  const setItem = (i: number, change: Partial<Item>) => setItems((list) => list.map((it, j) => (j === i ? { ...it, ...change } : it)));
  // A new expense gets its id up front, so a second tap on Save can't save it twice.
  const [newId] = useState(() => crypto.randomUUID());
  const [receipt, setReceipt] = useState(expense?.receipt ? "keep" : "");
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);

  const set = (key: keyof Values) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [key]: e.target.value }));
  const preview = receipt === "keep" ? expense?.receipt : receipt;
  const cost = Number(values.amount.replace(/[$,\s]/g, "")) || 0;
  const itemsTotal = items.reduce((sum, it) => sum + (Number(it.amount.replace(/[$,\s]/g, "")) || 0), 0);

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setMessage(null);
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (isPdf && file.size > PDF_MAX_BYTES) {
      setMessage({ ok: false, text: "That PDF is too big (over 2 MB). Try a smaller file or a photo of the receipt." });
      return;
    }
    setScanning(true);
    try {
      const dataUrl = isPdf ? (await readAsDataUrl(file)).replace(/^data:[^;]*;/, "data:application/pdf;") : await compress(file);
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
        if (result.items.length > 0) setItems(result.items.map((it) => blankItem(it.description, it.amount.toFixed(2))));
        setMessage({ ok: true, text: "Filled in from the receipt. Please check it, then Save." });
      }
    } catch {
      setMessage({ ok: false, text: "That file couldn't be read. Please try another." });
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
          📎 Choose file
        </button>
      </div>
      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onPhoto(e.target.files?.[0])} />
      <input ref={library} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { onPhoto(e.target.files?.[0]); e.target.value = ""; }} />
      {message && <p className={`rounded-lg p-2 text-sm ${message.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>{message.text}</p>}

      {preview && (
        <div className="flex items-start gap-3">
          <ReceiptView receipt={preview} />
          <button type="button" className="text-sm text-red-600 underline" onClick={() => setReceipt("")}>
            Remove receipt
          </button>
        </div>
      )}
      <input type="hidden" name="receipt" value={receipt} />
      {/* Tax isn't shown any more, but a scanned or saved amount is kept. */}
      <input type="hidden" name="tax" value={values.tax} />

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
          <label className="label" htmlFor="vendor">Purchased from</label>
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

      {/* Each item on the invoice can be charged to its own customer, with its own markup. */}
      <div className="space-y-2 rounded-lg bg-slate-50 p-3">
        <div className="flex items-center justify-between">
          <p className="label mb-0">Items · charge to customers</p>
          {items.length > 0 && (
            <p className={`text-xs ${Math.abs(itemsTotal - cost) < 0.005 ? "text-slate-500" : "font-semibold text-amber-700"}`}>
              ${itemsTotal.toFixed(2)} of ${cost.toFixed(2)}
            </p>
          )}
        </div>
        {items.length > 1 && (
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <select
              className="input"
              aria-label="Charge all items to"
              value=""
              onChange={(e) => {
                const client = e.target.value === "none" ? "" : e.target.value;
                setItems((list) => list.map((it) => ({ ...it, bill_client_id: client })));
              }}
            >
              <option value="" disabled>
                Charge all items to…
              </option>
              <option value="none">Swiftnet IT</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select
              className="input"
              aria-label="Markup for all items"
              value=""
              onChange={(e) => setItems((list) => list.map((it) => ({ ...it, markup_pct: Number(e.target.value) })))}
            >
              <option value="" disabled>
                All %
              </option>
              {MARKUPS.map((m) => (
                <option key={m} value={m}>{m}%</option>
              ))}
            </select>
          </div>
        )}
        {items.map((it, i) => {
          const amount = Number(it.amount.replace(/[$,\s]/g, "")) || 0;
          return (
            <div key={it.key} className="space-y-2 rounded-lg border border-slate-200 bg-white p-2">
              <div className="flex gap-2">
                <input className="input flex-1" aria-label="Item" placeholder="Item" value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} />
                <button type="button" aria-label="Remove item" className="px-1 text-slate-400 hover:text-red-600" onClick={() => setItems((list) => list.filter((_, j) => j !== i))}>
                  ✕
                </button>
              </div>
              <div className="flex gap-2">
                <input className="input w-24 shrink-0" aria-label="Item amount" inputMode="decimal" placeholder="$" value={it.amount} onChange={(e) => setItem(i, { amount: e.target.value })} />
                <select className="input min-w-0 flex-1" aria-label="Charge to" value={it.bill_client_id} onChange={(e) => setItem(i, { bill_client_id: e.target.value })}>
                  <option value="">Swiftnet IT</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>Charge to {c.name}</option>
                  ))}
                </select>
              </div>
              {it.bill_client_id && (
                <>
                  <div className="grid grid-cols-4 gap-1">
                    {MARKUPS.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setItem(i, { markup_pct: m })}
                        className={`rounded-lg border py-1.5 text-sm font-bold ${it.markup_pct === m ? "border-brand bg-brand text-white" : "border-slate-300 bg-white text-slate-700"}`}
                      >
                        {m}%
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>
                      Charge <span className="font-bold">${(Math.round(amount * (100 + it.markup_pct)) / 100).toFixed(2)}</span>
                    </span>
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" className="h-4 w-4" checked={it.charged} onChange={(e) => setItem(i, { charged: e.target.checked })} />
                      Sent to customer
                    </label>
                  </div>
                </>
              )}
            </div>
          );
        })}
        <button type="button" className="btn-light w-full" onClick={() => setItems((list) => [...list, blankItem(list.length ? "" : values.description, list.length ? "" : values.amount)])}>
          + Add item
        </button>
        <input type="hidden" name="items" value={JSON.stringify(items.map((it) => ({ description: it.description, amount: it.amount, bill_client_id: it.bill_client_id, markup_pct: it.markup_pct, charged: it.charged })))} />
      </div>
      {!expense && <input type="hidden" name="new_id" value={newId} />}
      <SaveButton disabled={scanning} />
    </form>
  );
}

/** Greys out while saving so it can't be tapped again. */
function SaveButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn w-full" disabled={disabled || pending}>
      {pending ? "Saving…" : "Save expense"}
    </button>
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
