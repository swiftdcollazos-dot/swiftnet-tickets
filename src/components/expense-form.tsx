"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { findDuplicateExpense, scanReceipt } from "@/app/actions";
import { ReceiptView } from "@/components/receipt-view";
import { pdfToJpeg } from "@/lib/pdf-to-image";
import type { JobOption } from "@/lib/job-options";
import { EXPENSE_CATEGORIES, PAYMENT_METHODS, PAYROLL_CATEGORY, PAYROLL_GUILDERS_PER_DOLLAR, VEHICLE_CATEGORY, VEHICLES, type Expense, type ExpenseItem } from "@/lib/types";

/** Shrinks a photo to at most 1600 px on its long side and returns it as a JPEG data URL. */
async function compress(file: File, maxSide = 1600, quality = 0.75): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", quality);
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

/** PDFs larger than this are shrunk into an image before scanning and saving. */
const PDF_MAX_BYTES = 2_000_000;

const dollars = (cents: number) => (cents ? (cents / 100).toFixed(2) : "");

type Values = { spent_on: string; vendor: string; category: string; description: string; amount: string; tax: string; payment_method: string; vehicle: string };

/** Markups offered when an item is bought to resell to a customer. */
const MARKUPS = [10, 15, 20, 25];

type Item = { key: string; description: string; amount: string; bill_client_id: string; markup_pct: number; charged: boolean; ticket_id: string };

const blankItem = (description = "", amount = ""): Item => ({
  key: crypto.randomUUID(),
  description,
  amount,
  bill_client_id: "",
  markup_pct: 20,
  charged: false,
  ticket_id: "",
});

/** Add or edit an expense. "Scan receipt" takes a photo and fills in the fields for you to check. */
export function ExpenseForm({
  expense,
  items: savedItems = [],
  today,
  clients,
  jobs = [],
  save,
}: {
  expense?: Expense;
  items?: ExpenseItem[];
  today: string;
  clients: { id: string; name: string }[];
  /** Customers' jobs an item can be put on. */
  jobs?: JobOption[];
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
    vehicle: expense?.vehicle ?? "",
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
      ticket_id: it.ticket_id ?? "",
    })),
  );
  const setItem = (i: number, change: Partial<Item>) => setItems((list) => list.map((it, j) => (j === i ? { ...it, ...change } : it)));
  // Typing or removing an item amount keeps the Total equal to the items added up.
  const changeAmounts = (next: Item[]) => {
    setItems(next);
    const sum = next.reduce((s, it) => s + (Number(it.amount.replace(/[$,\s]/g, "")) || 0), 0);
    if (sum > 0) setValues((v) => ({ ...v, amount: sum.toFixed(2) }));
  };
  // A new expense gets its id up front, so a second tap on Save can't save it twice.
  const [newId] = useState(() => crypto.randomUUID());
  const router = useRouter();
  const [receipt, setReceipt] = useState(expense?.receipt ? "keep" : "");
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  // The credit card machine's slip, kept as a second, smaller photo.
  const [slip, setSlip] = useState(expense?.card_slip ? "keep" : "");
  const [slipMenu, setSlipMenu] = useState(false);
  const slipCamera = useRef<HTMLInputElement>(null);
  const slipFile = useRef<HTMLInputElement>(null);
  const slipPreview = slip === "keep" ? expense?.card_slip : slip;
  const library = useRef<HTMLInputElement>(null);

  // Warn when an expense with the same date and total is already entered.
  const [duplicate, setDuplicate] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    const timer = setTimeout(() => {
      findDuplicateExpense(values.spent_on, values.amount, expense?.id ?? null)
        .then((found) => current && setDuplicate(found))
        .catch(() => {});
    }, 500);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [values.spent_on, values.amount, expense?.id]);

  // Payroll in guilders: typing the NAf amount fills the dollar total and notes the conversion.
  const [guilders, setGuilders] = useState("");
  function onGuilders(text: string) {
    setGuilders(text);
    const naf = Number(text.replace(/[,\s]/g, "")) || 0;
    const note = naf ? ` (NAf ${naf.toFixed(2)} at ${PAYROLL_GUILDERS_PER_DOLLAR} per $1)` : "";
    setValues((v) => ({
      ...v,
      amount: naf ? (Math.round((naf / PAYROLL_GUILDERS_PER_DOLLAR) * 100) / 100).toFixed(2) : v.amount,
      description: v.description.replace(/\s*\(NAf [\d.]+ at [\d.]+ per \$1\)/, "") + note,
    }));
  }

  const set = (key: keyof Values) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [key]: e.target.value }));
  const preview = receipt === "keep" ? expense?.receipt : receipt;
  const cost = Number(values.amount.replace(/[$,\s]/g, "")) || 0;
  const itemsTotal = items.reduce((sum, it) => sum + (Number(it.amount.replace(/[$,\s]/g, "")) || 0), 0);

  // A slip is kept small so it fits in the same save as the receipt: photos are shrunk, big PDFs become an image.
  async function onSlip(file: File | undefined) {
    if (!file) return;
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    try {
      let dataUrl: string;
      if (!isPdf) dataUrl = await compress(file, 1200, 0.6);
      else if (file.size <= 600_000) dataUrl = (await readAsDataUrl(file)).replace(/^data:[^;]*;/, "data:application/pdf;");
      else dataUrl = (await pdfToJpeg(file)).dataUrl;
      if (dataUrl.length > 1_000_000) {
        setMessage({ ok: false, text: "That slip file is too big. Try taking a picture of it instead." });
        return;
      }
      setSlip(dataUrl);
      setSlipMenu(false);
    } catch {
      setMessage({ ok: false, text: "That slip couldn't be read. Please try another." });
    }
  }

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setMessage(null);
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    setScanning(true);
    // A PDF over 2 MB is shrunk into one compressed image of its pages.
    let shrunk = "";
    try {
      let dataUrl: string;
      if (isPdf && file.size > PDF_MAX_BYTES) {
        try {
          const image = await pdfToJpeg(file);
          dataUrl = image.dataUrl;
          shrunk = image.totalPages > image.pages
            ? ` The PDF was over 2 MB, so its first ${image.pages} of ${image.totalPages} pages were saved as a smaller image.`
            : " The PDF was over 2 MB, so it was saved as a smaller image.";
        } catch (e) {
          console.error("pdfToJpeg", e);
          setMessage({ ok: false, text: "That PDF is too big to shrink. Try a photo of the receipt instead." });
          return;
        }
      } else {
        dataUrl = isPdf ? (await readAsDataUrl(file)).replace(/^data:[^;]*;/, "data:application/pdf;") : await compress(file);
      }
      setReceipt(dataUrl);
      const result = await scanReceipt(dataUrl);
      if ("error" in result) {
        setMessage({ ok: false, text: result.error + shrunk });
      } else {
        setValues((v) => ({
          spent_on: result.date || v.spent_on,
          vendor: result.vendor || v.vendor,
          category: result.category || v.category,
          description: result.description || v.description,
          amount: result.total ? result.total.toFixed(2) : v.amount,
          tax: result.tax ? result.tax.toFixed(2) : v.tax,
          payment_method: result.payment_method || v.payment_method,
          vehicle: v.vehicle,
        }));
        if (result.items.length > 0) setItems(result.items.map((it) => blankItem(it.description, it.amount.toFixed(2))));
        const converted = result.guilders_total ? ` Converted NAf ${result.guilders_total.toFixed(2)} to $${result.total.toFixed(2)} (1.8 guilders per dollar).` : "";
        setMessage({ ok: true, text: `Filled in from the receipt.${converted}${shrunk} Please check it, then Save.` });
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

      {slipPreview ? (
        <div className="flex items-start gap-3">
          <ReceiptView receipt={slipPreview} />
          <div className="space-y-1 text-sm">
            <p className="font-semibold text-slate-700">Card machine slip</p>
            <button type="button" className="text-red-600 underline" onClick={() => setSlip("")}>
              Remove slip
            </button>
          </div>
        </div>
      ) : slipMenu ? (
        <div className="space-y-2 rounded-lg border border-slate-200 p-2">
          <p className="text-sm font-semibold text-slate-700">🧾 Card machine slip</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="btn-light" onClick={() => slipCamera.current?.click()}>
              📷 Take picture
            </button>
            <button type="button" className="btn-light" onClick={() => slipFile.current?.click()}>
              📎 Choose file
            </button>
          </div>
          <button type="button" className="w-full text-sm text-slate-500 underline" onClick={() => setSlipMenu(false)}>
            Never mind
          </button>
        </div>
      ) : (
        <button type="button" className="btn-light w-full" disabled={scanning} onClick={() => setSlipMenu(true)}>
          🧾 Add card machine slip
        </button>
      )}
      <input ref={slipCamera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { onSlip(e.target.files?.[0]); e.target.value = ""; }} />
      <input ref={slipFile} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { onSlip(e.target.files?.[0]); e.target.value = ""; }} />
      <input type="hidden" name="card_slip" value={slip} />
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
          <select className="input" id="payment_method" name="payment_method" value={values.payment_method} onChange={set("payment_method")} required>
            <option value="" disabled>Pick one…</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </div>
        {values.category === VEHICLE_CATEGORY && (
          <div className="col-span-2">
            <label className="label" htmlFor="vehicle">Vehicle</label>
            <select className="input" id="vehicle" name="vehicle" value={values.vehicle} onChange={set("vehicle")}>
              <option value="">—</option>
              {VEHICLES.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </div>
        )}
        {values.category === PAYROLL_CATEGORY && (
          <div className="col-span-2 rounded-lg bg-slate-50 p-3">
            <label className="label" htmlFor="guilders">Paid in guilders? Amount in NAf</label>
            <input className="input" inputMode="decimal" id="guilders" placeholder="NAf" value={guilders} onChange={(e) => onGuilders(e.target.value)} />
            <p className="mt-1 text-xs text-slate-500">The dollar total fills in at {PAYROLL_GUILDERS_PER_DOLLAR} guilders per $1.</p>
          </div>
        )}
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
          <div className={`grid gap-2 ${items.some((it) => it.bill_client_id) ? "grid-cols-[1fr_auto]" : "grid-cols-1"}`}>
            <select
              className="input"
              aria-label="Charge all items to"
              value={items.every((it) => it.bill_client_id === items[0].bill_client_id) ? items[0].bill_client_id || "none" : ""}
              onChange={(e) => {
                const client = e.target.value === "none" ? "" : e.target.value;
                setItems((list) => list.map((it) => ({ ...it, bill_client_id: client, ticket_id: it.bill_client_id === client ? it.ticket_id : "" })));
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
            {/* A markup only applies to items resold to a customer; Swiftnet IT's own items are just a cost. */}
            {items.some((it) => it.bill_client_id) && (
            <select
              className="input"
              aria-label="Markup for all items"
              value={(() => {
                const resold = items.filter((it) => it.bill_client_id);
                return resold.every((it) => it.markup_pct === resold[0].markup_pct) ? resold[0].markup_pct : "";
              })()}
              onChange={(e) => setItems((list) => list.map((it) => ({ ...it, markup_pct: Number(e.target.value) })))}
            >
              <option value="" disabled>
                All %
              </option>
              {MARKUPS.map((m) => (
                <option key={m} value={m}>{m}%</option>
              ))}
            </select>
            )}
          </div>
        )}
        {items.map((it, i) => {
          const amount = Number(it.amount.replace(/[$,\s]/g, "")) || 0;
          return (
            <div key={it.key} className="space-y-2 rounded-lg border border-slate-200 bg-white p-2">
              <div className="flex gap-2">
                <input className="input flex-1" aria-label="Item" placeholder="Item" value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} />
                <button type="button" aria-label="Remove item" className="px-1 text-slate-400 hover:text-red-600" onClick={() => changeAmounts(items.filter((_, j) => j !== i))}>
                  ✕
                </button>
              </div>
              <div className="flex gap-2">
                <input className="input w-24 shrink-0" aria-label="Item amount" inputMode="decimal" placeholder="$" value={it.amount} onChange={(e) => changeAmounts(items.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
                <select className="input min-w-0 flex-1" aria-label="Charge to" value={it.bill_client_id} onChange={(e) => setItem(i, { bill_client_id: e.target.value, ticket_id: "" })}>
                  <option value="">Swiftnet IT</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>Charge to {c.name}</option>
                  ))}
                </select>
              </div>
              {it.bill_client_id && (
                <>
                  <select className="input" aria-label="Put on job" value={it.ticket_id} onChange={(e) => setItem(i, { ticket_id: e.target.value })}>
                    <option value="">Not on a job (bill it separately)</option>
                    {jobs
                      .filter((j) => j.client_id === it.bill_client_id)
                      .map((j) => (
                        <option key={j.id} value={j.id}>Put on {j.label}</option>
                      ))}
                  </select>
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
                    {it.ticket_id ? (
                      <span className="text-slate-500">Billed on the job</span>
                    ) : (
                      <label className="flex items-center gap-1.5">
                        <input type="checkbox" className="h-4 w-4" checked={it.charged} onChange={(e) => setItem(i, { charged: e.target.checked })} />
                        Sent to customer
                      </label>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
        <button type="button" className="btn-light w-full" onClick={() => setItems((list) => [...list, blankItem(list.length ? "" : values.description, list.length ? "" : values.amount)])}>
          + Add item
        </button>
        <input type="hidden" name="items" value={JSON.stringify(items.map((it) => ({ description: it.description, amount: it.amount, bill_client_id: it.bill_client_id, markup_pct: it.markup_pct, charged: it.charged, ticket_id: it.ticket_id })))} />
      </div>
      {!expense && <input type="hidden" name="new_id" value={newId} />}
      {duplicate && (
        <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-semibold">⚠️ This may be a duplicate. {duplicate}</p>
          <label className="flex items-center gap-2">
            <input type="checkbox" required className="h-4 w-4" />
            It&apos;s a different purchase, save it anyway
          </label>
        </div>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          className="btn-light flex-1"
          onClick={() => {
            if (!confirm(expense ? "Cancel your changes to this expense?" : "Cancel this expense? Nothing will be saved.")) return;
            // Reloading clears everything typed into a new expense; an edit goes back to the list.
            if (expense) router.push("/expenses");
            else window.location.reload();
          }}
        >
          Cancel
        </button>
        <SaveButton disabled={scanning} />
      </div>
    </form>
  );
}

/** Greys out while saving so it can't be tapped again. */
function SaveButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn flex-1" disabled={disabled || pending}>
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
