import Link from "next/link";
import { Suspense } from "react";
import { formatHours, formatMoney } from "@/lib/billing";
import { loadTicket } from "@/lib/ticket-data";
import { formatDate, formatTime } from "@/lib/time";
import { KIND_LABELS } from "@/lib/types";
import { Loading } from "@/components/loading";
import { PrintButton } from "@/components/print-button";

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
  const money = (c: number) => formatMoney(c, settings.currency);
  const title = ticket.is_estimate ? "ESTIMATE" : "SERVICE TICKET";

  return (
    <div className="min-h-screen bg-slate-100 p-4 print:bg-white print:p-0">
      <div className="mx-auto mb-4 flex max-w-[800px] gap-2 print:hidden">
        <Link href={`/tickets/${ticket.id}`} className="btn-light">← Back</Link>
        <span className="flex-1" />
        <PrintButton />
      </div>

      <article className="mx-auto max-w-[800px] bg-white p-8 text-sm text-slate-900 shadow print:max-w-none print:shadow-none">
        <header className="mb-6 flex items-start justify-between border-b-2 border-brand pb-4">
          <div>
            <h1 className="text-2xl font-bold text-brand">{settings.company_name}</h1>
            <p className="whitespace-pre-line text-slate-600">
              {[settings.company_address, settings.company_phone, settings.company_email].filter(Boolean).join("\n")}
            </p>
          </div>
          <div className="text-right">
            <p className="font-bold tracking-wide">{title}</p>
            <p className="font-mono text-2xl text-red-600">#{ticket.number}</p>
            <p>{formatDate(ticket.ticket_date)}</p>
            <p className="text-slate-600">{KIND_LABELS[ticket.kind]}</p>
            {ticket.is_estimate && <p className="text-xs text-slate-500">Valid for 30 days</p>}
          </div>
        </header>

        <section className="mb-6 grid grid-cols-2 gap-6">
          <div>
            <h2 className="mb-1 text-xs font-bold uppercase text-slate-500">Client</h2>
            <p className="font-semibold">{client.name}</p>
            {client.address && <p>{client.address}</p>}
            {client.phone && <p>{client.phone}</p>}
            {client.email && <p>{client.email}</p>}
          </div>
          <div>
            <h2 className="mb-1 text-xs font-bold uppercase text-slate-500">Item serviced</h2>
            <p className="font-semibold">{ticket.item_to_service || "—"}</p>
            {ticket.make && <p>Make: {ticket.make}</p>}
            {ticket.model && <p>Model: {ticket.model}</p>}
          </div>
        </section>

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

        <section className="mb-8 flex justify-end">
          <table className="w-72">
            <tbody>
              <Total label={`Total labor (${formatHours(totals.billableMinutes)})`} value={money(totals.laborCents)} />
              <Total label="Total materials" value={money(totals.materialsCents)} />
              {ticket.tax_rate_pct > 0 && <Total label={`Tax (${ticket.tax_rate_pct}%)`} value={money(totals.taxCents)} />}
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
            {ticket.date_wanted && <p>Date wanted: {formatDate(ticket.date_wanted)}</p>}
            <p>Technician: {techName(ticket.technician_id)}</p>
          </div>
        </section>

        <footer className="border-t border-slate-200 pt-3 text-center text-xs text-slate-500">
          {ticket.is_estimate && <p>Estimates are for labor only, material additional.</p>}
          <p>{settings.disclaimer}</p>
          <p className="mt-1 font-semibold">{settings.terms}</p>
        </footer>
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
