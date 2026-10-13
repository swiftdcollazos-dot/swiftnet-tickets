import { DictationTextarea } from "@/components/dictation-textarea";
import { SERVICE_TYPES, kindLabel, type Ticket } from "@/lib/types";

/** The ticket's own fields, laid out like the paper repair order. */
export function TicketFields({ ticket, today }: { ticket?: Partial<Ticket>; today: string }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <div>
          <label className="label" htmlFor="ticket_date">Date</label>
          <input className="input" type="date" id="ticket_date" name="ticket_date" defaultValue={ticket?.ticket_date ?? today} />
        </div>
        <div>
          <label className="label" htmlFor="kind">Type</label>
          <select className="input" id="kind" name="kind" defaultValue={kindLabel(ticket?.kind)}>
            <option value="">Select a service type</option>
            {SERVICE_TYPES.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="item_to_service">Item to be serviced</label>
        <input className="input" id="item_to_service" name="item_to_service" placeholder="Laptop, server, printer, network…" defaultValue={ticket?.item_to_service ?? ""} />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="make">Make</label>
          <input className="input" id="make" name="make" defaultValue={ticket?.make ?? ""} />
        </div>
        <div>
          <label className="label" htmlFor="model">Model</label>
          <input className="input" id="model" name="model" defaultValue={ticket?.model ?? ""} />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className="label" htmlFor="machine_name">Machine name</label>
          <input className="input" id="machine_name" name="machine_name" placeholder="e.g. FRONT-DESK-PC" defaultValue={ticket?.machine_name ?? ""} />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="labor_performed">Labor performed</label>
        <DictationTextarea rows={4} id="labor_performed" name="labor_performed" defaultValue={ticket?.labor_performed ?? ""} />
      </div>
    </div>
  );
}
