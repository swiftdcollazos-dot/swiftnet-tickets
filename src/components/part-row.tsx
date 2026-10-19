"use client";

import { useState } from "react";

type Part = { id: string; qty: number; description: string; part_number: string; unit_price_cents: number };

/** One part in the Parts and materials table, with Edit and ✕ while the job is open. */
export function PartRow({
  part,
  price,
  amount,
  closed,
  update,
  remove,
}: {
  part: Part;
  price: string;
  amount: string;
  closed: boolean;
  update: (form: FormData) => Promise<void>;
  remove: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <tr className="border-t border-slate-100">
        <td colSpan={5} className="py-2">
          <form
            action={async (form) => {
              await update(form);
              setEditing(false);
            }}
            className="grid grid-cols-4 gap-2 rounded-lg bg-slate-50 p-2"
          >
            <div>
              <label className="label" htmlFor={`qty-${part.id}`}>Qty</label>
              <input className="input" inputMode="decimal" id={`qty-${part.id}`} name="qty" defaultValue={String(part.qty)} />
            </div>
            <div className="col-span-3">
              <label className="label" htmlFor={`description-${part.id}`}>Description</label>
              <input className="input" id={`description-${part.id}`} name="description" defaultValue={part.description} required />
            </div>
            <div className="col-span-2">
              <label className="label" htmlFor={`part_number-${part.id}`}>Part #</label>
              <input className="input" id={`part_number-${part.id}`} name="part_number" defaultValue={part.part_number} />
            </div>
            <div className="col-span-2">
              <label className="label" htmlFor={`price-${part.id}`}>Price each ($)</label>
              <input className="input" inputMode="decimal" id={`price-${part.id}`} name="price" defaultValue={(part.unit_price_cents / 100).toFixed(2)} required />
            </div>
            <button className="btn col-span-2">Save</button>
            <button type="button" className="btn-light col-span-2" onClick={() => setEditing(false)}>Cancel</button>
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-t border-slate-100">
      <td className="py-2">{part.qty}</td>
      <td>
        {part.description}
        {part.part_number && <div className="text-xs text-slate-400">Part # {part.part_number}</div>}
      </td>
      <td className="text-right">{price}</td>
      <td className="text-right">{amount}</td>
      <td className="pl-2 text-right">
        {!closed && (
          <div className="flex justify-end gap-1">
            <button type="button" className="btn-light px-2 py-1 text-xs" onClick={() => setEditing(true)}>Edit</button>
            <form action={remove}>
              <button className="btn-danger">✕</button>
            </form>
          </div>
        )}
      </td>
    </tr>
  );
}
