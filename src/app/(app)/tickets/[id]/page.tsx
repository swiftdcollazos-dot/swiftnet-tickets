import Link from "next/link";
import { Suspense } from "react";
import {
  addPart,
  closeTicket,
  addTimeEntry,
  clearSignature,
  deletePart,
  deleteTimeEntry,
  setStatus,
  startTimer,
  stopTimer,
  updateTicket,
} from "@/app/actions";
import { entryMinutes, formatMinutes, formatMoney } from "@/lib/billing";
import { loadTicket } from "@/lib/ticket-data";
import { formatDate, formatTime, todayLocal } from "@/lib/time";
import { STATUS_LABELS } from "@/lib/types";
import { LiveTimer } from "@/components/live-timer";
import { Loading } from "@/components/loading";
import { SignaturePad } from "@/components/signature-pad";
import { TicketFields } from "@/components/ticket-fields";

export default function TicketPage(props: PageProps<"/tickets/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      <TicketDetail params={props.params} />
    </Suspense>
  );
}

async function TicketDetail({ params }: { params: PageProps<"/tickets/[id]">["params"] }) {
  const { id } = await params;
  const { ticket, client, entries, parts, totals, settings, techName } = await loadTicket(id);
  const running = entries.find((e) => !e.ended_at);
  const closed = ticket.status !== "open";
  const money = (c: number) => formatMoney(c, settings.currency);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1">
          <p className="font-mono text-sm text-slate-400">
            Service Ticket #{ticket.number} · {formatDate(ticket.ticket_date)}
          </p>
          <h1 className="h1">{client.name}</h1>
          <p className="text-sm text-slate-500">
            {[client.phone, client.email, client.address].filter(Boolean).join(" · ")}
          </p>
        </div>
        <Link href={`/print/${ticket.id}`} className="btn-light">Print / PDF</Link>
      </div>

      {closed ? (
        <div className="card flex flex-wrap items-center gap-2 border-green-300 bg-green-50">
          <span className="flex-1 font-semibold text-green-800">
            ✓ {STATUS_LABELS[ticket.status]}. This service ticket can no longer be edited.
          </span>
          {ticket.status === "completed" && (
            <form action={setStatus.bind(null, ticket.id, "paid")}>
              <button className="btn">Mark as paid</button>
            </form>
          )}
          <form action={setStatus.bind(null, ticket.id, "open")}>
            <button className="btn-light">Reopen</button>
          </form>
        </div>
      ) : (
        <form action={closeTicket.bind(null, ticket.id)}>
          <button className="btn w-full bg-green-700 py-3 text-base">✓ Complete &amp; close service ticket</button>
        </form>
      )}

      {/* Time */}
      <section className="card">
        <h2 className="h2">Time</h2>
        {closed ? null : running ? (
          <form action={stopTimer.bind(null, ticket.id, running.id)} className="mb-4 flex items-center gap-3 rounded-lg bg-red-50 p-3">
            <span className="text-red-700">● Working</span>
            <span className="flex-1 text-xl text-red-700"><LiveTimer startedAt={running.started_at} /></span>
            <button className="btn bg-red-600">Stop</button>
          </form>
        ) : (
          <form action={startTimer.bind(null, ticket.id)} className="mb-4">
            <button className="btn w-full">▶ Start timer (time in)</button>
          </form>
        )}

        {entries.length > 0 && (
          <table className="mb-4 w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500">
              <tr><th className="py-1">Date</th><th>In</th><th>Out</th><th>Time</th><th></th></tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-t border-slate-100">
                  <td className="py-2">
                    {formatDate(e.started_at)}
                    <div className="text-xs text-slate-400">{techName(e.technician_id)}</div>
                  </td>
                  <td>{formatTime(e.started_at)}</td>
                  <td>{e.ended_at ? formatTime(e.ended_at) : "…"}</td>
                  <td>{formatMinutes(entryMinutes({ startedAt: e.started_at, endedAt: e.ended_at }))}</td>
                  <td className="text-right">
                    {!closed && (
                      <form action={deleteTimeEntry.bind(null, ticket.id, e.id)}>
                        <button className="btn-danger">Remove</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {!closed && (
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-brand">Add time manually</summary>
            <form action={addTimeEntry.bind(null, ticket.id)} className="mt-3 grid grid-cols-3 gap-2">
              <div>
                <label className="label" htmlFor="date">Date</label>
                <input className="input" type="date" id="date" name="date" defaultValue={todayLocal()} required />
              </div>
              <div>
                <label className="label" htmlFor="time_in">Time in</label>
                <input className="input" type="time" id="time_in" name="time_in" required />
              </div>
              <div>
                <label className="label" htmlFor="time_out">Time out</label>
                <input className="input" type="time" id="time_out" name="time_out" required />
              </div>
              <button className="btn-light col-span-3">Add time</button>
            </form>
          </details>
        )}
      </section>

      {/* Parts */}
      <section className="card">
        <h2 className="h2">Parts and materials</h2>
        {parts.length > 0 && (
          <table className="mb-4 w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500">
              <tr><th className="py-1">Qty</th><th>Description</th><th className="text-right">Price</th><th className="text-right">Amount</th><th></th></tr>
            </thead>
            <tbody>
              {parts.map((p) => (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="py-2">{p.qty}</td>
                  <td>
                    {p.description}
                    {p.part_number && <div className="text-xs text-slate-400">Part # {p.part_number}</div>}
                  </td>
                  <td className="text-right">{money(p.unit_price_cents)}</td>
                  <td className="text-right">{money(Math.round(p.qty * p.unit_price_cents))}</td>
                  <td className="pl-2 text-right">
                    {!closed && (
                      <form action={deletePart.bind(null, ticket.id, p.id)}>
                        <button className="btn-danger">✕</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!closed && (
          <details open={parts.length === 0}>
            <summary className="cursor-pointer text-sm font-semibold text-brand">Add a part</summary>
            <form action={addPart.bind(null, ticket.id)} className="mt-3 grid grid-cols-4 gap-2">
              <div>
                <label className="label" htmlFor="qty">Qty</label>
                <input className="input" inputMode="decimal" id="qty" name="qty" defaultValue="1" />
              </div>
              <div className="col-span-3">
                <label className="label" htmlFor="description">Description</label>
                <input className="input" id="description" name="description" required />
              </div>
              <div className="col-span-2">
                <label className="label" htmlFor="part_number">Part #</label>
                <input className="input" id="part_number" name="part_number" />
              </div>
              <div className="col-span-2">
                <label className="label" htmlFor="price">Price each ($)</label>
                <input className="input" inputMode="decimal" id="price" name="price" required />
              </div>
              <button className="btn-light col-span-4">Add part</button>
            </form>
          </details>
        )}
      </section>

      {/* Totals */}
      <section className="card">
        <h2 className="h2">Total</h2>
        <dl className="space-y-1 text-sm">
          <Row label={`Labor: ${formatMinutes(totals.billableMinutes)} × ${money(ticket.hourly_rate_cents)}/h`} value={money(totals.laborCents)} />
          {totals.billableMinutes !== Math.round(totals.workedMinutes) && (
            <p className="text-xs text-slate-400">
              Worked {formatMinutes(totals.workedMinutes)}, billed in {ticket.rounding_minutes}-minute blocks
              {ticket.minimum_minutes > 0 ? ` with a ${formatMinutes(ticket.minimum_minutes)} minimum` : ""}.
            </p>
          )}
          <Row label="Materials" value={money(totals.materialsCents)} />
          <div className="border-t border-slate-200 pt-1">
            <Row label="Total" value={money(totals.totalCents)} bold />
          </div>
        </dl>
        {running && <p className="mt-2 text-xs text-amber-700">The timer is still running, so this total will keep going up.</p>}
      </section>

      {/* Details */}
      <section className="card">
        <h2 className="h2">Job details</h2>
        <form action={updateTicket.bind(null, ticket.id)}>
          <fieldset disabled={closed} className="space-y-4 disabled:opacity-70">
            <TicketFields ticket={ticket} today={todayLocal()} />
            {!closed && <button className="btn w-full">Save details</button>}
          </fieldset>
        </form>
      </section>

      {/* Signature */}
      <section className="card">
        <h2 className="h2">Client signature</h2>
        {ticket.signature ? (
          <div className="space-y-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={ticket.signature} alt="Client signature" className="h-32 rounded border border-slate-200 bg-white" />
            <p className="text-sm text-slate-500">
              Signed by {ticket.signed_name || "client"} on {formatDate(ticket.signed_at)} at {formatTime(ticket.signed_at)}
            </p>
            {!closed && (
              <form action={clearSignature.bind(null, ticket.id)}>
                <button className="btn-danger">Remove signature</button>
              </form>
            )}
          </div>
        ) : (
          <>
            <p className="mb-3 text-sm text-slate-500">
              By signing, the client approves the work and the total of {money(totals.totalCents)}.
            </p>
            <SignaturePad ticketId={ticket.id} defaultName={client.name} />
          </>
        )}
      </section>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "text-base font-bold" : ""}`}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
