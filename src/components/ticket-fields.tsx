import { KIND_LABELS, type Ticket } from "@/lib/types";

/** The ticket's own fields, laid out like the paper repair order. */
export function TicketFields({ ticket, today }: { ticket?: Partial<Ticket>; today: string }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="ticket_date">Date</label>
          <input className="input" type="date" id="ticket_date" name="ticket_date" defaultValue={ticket?.ticket_date ?? today} />
        </div>
        <div>
          <label className="label" htmlFor="kind">Type</label>
          <select className="input" id="kind" name="kind" defaultValue={ticket?.kind ?? "service"}>
            {Object.entries(KIND_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="is_estimate" defaultChecked={ticket?.is_estimate ?? false} className="size-4" />
        This is an estimate (valid for 30 days)
      </label>

      <div>
        <label className="label" htmlFor="item_to_service">Item to be serviced</label>
        <input className="input" id="item_to_service" name="item_to_service" placeholder="Laptop, server, printer, network…" defaultValue={ticket?.item_to_service ?? ""} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="make">Make</label>
          <input className="input" id="make" name="make" defaultValue={ticket?.make ?? ""} />
        </div>
        <div>
          <label className="label" htmlFor="model">Model</label>
          <input className="input" id="model" name="model" defaultValue={ticket?.model ?? ""} />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="labor_performed">Labor performed</label>
        <textarea className="input" rows={4} id="labor_performed" name="labor_performed" defaultValue={ticket?.labor_performed ?? ""} />
      </div>
      <div>
        <label className="label" htmlFor="date_wanted">Date wanted</label>
        <input className="input" type="date" id="date_wanted" name="date_wanted" defaultValue={ticket?.date_wanted ?? ""} />
      </div>
    </div>
  );
}
