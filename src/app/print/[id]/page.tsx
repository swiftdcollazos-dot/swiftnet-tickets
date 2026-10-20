import Link from "next/link";
import { Suspense } from "react";
import { formatHours, formatMoney } from "@/lib/billing";
import { loadTicket } from "@/lib/ticket-data";
import { formatDate, formatTime } from "@/lib/time";
import { kindLabel, recordLabel } from "@/lib/types";
import { Loading } from "@/components/loading";
import { PrintButton } from "@/components/print-button";
import { PaidStamp } from "@/components/paid-stamp";

export default function PrintPage(props: PageProps<"/print/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      <PrintTicket params={props.params} />
    </Suspense>
  );
}

async function PrintTicket({ params }: { params: PageProps<"/print/[id]">["params"] }) {
  const { id } = await params;
  const { ticket, client, parts, totals, settings, techName } = await loadTicket(id);
  const call = client.client_type === "contract" && !ticket.is_project; // special projects are billed like tickets
  const money = (c: number) => formatMoney(c, settings.currency);

  return (
    <div className="min-h-screen bg-slate-100 p-4 print:bg-white print:p-0">
      <div className="mx-auto mb-4 flex max-w-[800px] gap-2 print:hidden">
        <Link href={`/tickets/${ticket.id}`} className="btn-light">← Back</Link>
        <span className="flex-1" />
        <PrintButton fileName={`Swiftnet ${recordLabel(client.client_type, ticket.is_project)} ${ticket.number}`} />
      </div>

      <article className="mx-auto max-w-[800px] bg-white p-8 text-sm text-slate-900 shadow print:max-w-none print:shadow-none">
        <header className="mb-6 flex items-start justify-between border-b-2 border-brand pb-4">
          <div>
            <h1 className="mb-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- plain img prints reliably */}
              <img src="/logo.png" alt={settings.company_name || "Swiftnet I.T."} className="h-12 w-auto" />
            </h1>
            <p className="whitespace-pre-line text-slate-600">
              {[settings.company_address, settings.company_phone, settings.company_email].filter(Boolean).join("\n")}
            </p>
          </div>
          <div className="text-right">
            <p className="font-bold tracking-wide">{recordLabel(client.client_type, ticket.is_project).toUpperCase()}</p>
            <p className="font-mono text-2xl text-red-600">#{ticket.number}</p>
            <p>{formatDate(ticket.ticket_date)}</p>
            <p className="text-slate-600">{kindLabel(ticket.kind)}</p>
          </div>
        </header>

        <section className="mb-6 grid grid-cols-2 gap-6">
          <div>
            <h2 className="mb-1 text-xs font-bold uppercase text-slate-500">Client</h2>
            <p className="font-semibold">{client.name}</p>
            {client.address && <p>{client.address}</p>}
            {client.phone && <p>{client.phone}</p>}
            {client.email && <p>{client.email}</p>}
            {ticket.contacted_by && <p>Contacted by: {ticket.contacted_by}</p>}
          </div>
          <div>
            <h2 className="mb-1 text-xs font-bold uppercase text-slate-500">Item serviced</h2>
            <p className="font-semibold">{ticket.item_to_service || "—"}</p>
            {ticket.make && <p>Make: {ticket.make}</p>}
            {ticket.model && <p>Model: {ticket.model}</p>}
            {ticket.machine_name && <p>Machine name: {ticket.machine_name}</p>}
          </div>
        </section>

        {ticket.service_request && (
          <section className="mb-6">
            <h2 className="mb-1 text-xs font-bold uppercase text-slate-500">{ticket.is_project ? "Labor to be performed" : "Issue reported"}</h2>
            <p className="whitespace-pre-line">{ticket.service_request}</p>
          </section>
        )}

        {ticket.labor_performed && (
          <section className="mb-6">
            <h2 className="mb-1 text-xs font-bold uppercase text-slate-500">Labor performed</h2>
            <p className="whitespace-pre-line">{ticket.labor_performed}</p>
          </section>
        )}

        {parts.length > 0 && (
          <table className="mb-6 w-full border-collapse">
            <thead>
              <tr className="bg-slate-100 text-left text-xs uppercase">
                <th className="p-2">Qty</th><th className="p-2">Part #</th><th className="p-2">Description of parts or materials</th><th className="p-2 text-right">Price</th><th className="p-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {parts.map((p) => (
                <tr key={p.id} className="border-b border-slate-200">
                  <td className="p-2">{p.qty}</td>
                  <td className="p-2">{p.part_number}</td>
                  <td className="p-2">{p.description}</td>
                  <td className="p-2 text-right">{money(p.unit_price_cents)}</td>
                  <td className="p-2 text-right">{money(Math.round(p.qty * p.unit_price_cents))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <section className="mb-8 flex items-center justify-end">
          {ticket.status === "paid" && !call && <PaidStamp className="mr-auto ml-8 w-36" />}
          <table className="w-72">
            <tbody>
              {call ? (
                <Total label={`Time spent (${formatHours(Math.ceil(Math.round(totals.workedMinutes) / 60) * 60)})`} value="Not charged" />
              ) : (
                <Total label={`Total labor (${formatHours(totals.billableMinutes)})`} value={money(totals.laborCents)} />
              )}
              <Total label="Total materials" value={money(totals.materialsCents)} />
              <Total label="Total amount" value={money(totals.totalCents)} bold />
            </tbody>
          </table>
        </section>

        <section className="mb-6 grid grid-cols-2 items-end gap-6">
          <div>
            {ticket.signature ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={ticket.signature} alt="Client signature" className="h-20" />
            ) : (
              <div className="h-20" />
            )}
            <div className="border-t border-slate-400 pt-1 text-xs text-slate-600">
              Authorized by: {ticket.signed_name ?? ""}
              {ticket.signed_at && ` · ${formatDate(ticket.signed_at)} ${formatTime(ticket.signed_at)}`}
            </div>
          </div>
          <div className="text-xs text-slate-600">
            <p>Technician: {techName(ticket.technician_id)}</p>
          </div>
        </section>
      </article>
    </div>
  );
}

function Total({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <tr className={bold ? "border-t border-slate-300 font-bold" : ""}>
      <td className="py-1 pr-2">{label}</td>
      <td className="py-1 text-right tabular-nums">{value}</td>
    </tr>
  );
}
