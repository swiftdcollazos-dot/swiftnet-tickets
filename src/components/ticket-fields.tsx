import { DictationTextarea } from "@/components/dictation-textarea";
import { PROJECT_TYPES, REPEATS, SERVICE_TYPES, kindLabel, projectKinds, type Ticket } from "@/lib/types";

export function ContactedByField({ value }: { value?: string }) {
  return (
    <div>
      <label className="label" htmlFor="contacted_by">Contacted by</label>
      <input className="input" id="contacted_by" name="contacted_by" placeholder="Who called or asked for this job" defaultValue={value ?? ""} />
    </div>
  );
}

/**
 * The ticket's own fields, laid out like the paper repair order.
 * Special projects get a shorter form: a project title, several project types can be ticked, there are no make, model
 * or machine fields, and the issue box becomes "Labor to be performed".
 */
export function TicketFields({ ticket, today, withContactedBy = true, project = false, technicians, call = false }: { ticket?: Partial<Ticket>; today: string; withContactedBy?: boolean; project?: boolean; technicians?: { id: string; name: string }[]; call?: boolean }) {
  return (
    <div className="space-y-4">
      {call && (
        <div>
          <label className="label" htmlFor="repeats">Repeats</label>
          <select className="input" id="repeats" name="repeats" defaultValue={ticket?.repeats ?? ""}>
            <option value="">No, a one-time call</option>
            {Object.entries(REPEATS).map(([value, label]) => (
              <option key={value} value={value}>{label} (stays open, time adds to the contract)</option>
            ))}
          </select>
        </div>
      )}
      {project && (
        // Projects keep their title in the column service tickets use for the item to be serviced.
        <div>
          <label className="label" htmlFor="item_to_service">Project title</label>
          <input className="input" id="item_to_service" name="item_to_service" placeholder="e.g. Store camera system install" defaultValue={ticket?.item_to_service ?? ""} />
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <div>
          <label className="label" htmlFor="ticket_date">Date</label>
          <input className="input" type="date" id="ticket_date" name="ticket_date" defaultValue={ticket?.ticket_date ?? today} />
        </div>
        {!project && (
          <div>
            <label className="label" htmlFor="kind">Type</label>
            <select className="input" id="kind" name="kind" defaultValue={kindLabel(ticket?.kind)}>
              <option value="">Select a service type</option>
              {SERVICE_TYPES.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {project && <ProjectTypes kind={ticket?.kind} />}

      {withContactedBy && <ContactedByField value={ticket?.contacted_by} />}

      {technicians && (
        <div>
          <label className="label" htmlFor="technician_id">Assigned to</label>
          <select className="input" id="technician_id" name="technician_id" defaultValue={ticket?.technician_id ?? ""}>
            {!ticket?.technician_id && <option value="">Not assigned</option>}
            {technicians.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      )}

      {!project && (
        <>
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
            <label className="label" htmlFor="service_request">Issue reported</label>
            <DictationTextarea rows={3} id="service_request" name="service_request" defaultValue={ticket?.service_request ?? ""} />
          </div>
        </>
      )}
      {project && (
        // Projects keep their plan of work in the same column service tickets use for the issue reported.
        <div>
          <label className="label" htmlFor="service_request">Labor to be performed</label>
          <DictationTextarea rows={4} id="service_request" name="service_request" defaultValue={ticket?.service_request ?? ""} />
        </div>
      )}
      <div>
        <label className="label" htmlFor="labor_performed">Labor performed</label>
        <DictationTextarea rows={4} id="labor_performed" name="labor_performed" defaultValue={ticket?.labor_performed ?? ""} />
      </div>
    </div>
  );
}

function ProjectTypes({ kind }: { kind?: string }) {
  const selected = projectKinds(kind);
  return (
    <fieldset>
      <legend className="label">Type <span className="font-normal normal-case text-slate-400">(pick all that apply)</span></legend>
      <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
        {PROJECT_TYPES.map((type) => (
          <label key={type} className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="kind" value={type} defaultChecked={selected.includes(type)} className="mt-0.5 h-4 w-4 shrink-0" />
            {type}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
