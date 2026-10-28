import { Suspense } from "react";
import { AddClientForm, DeleteClientButton, EditClientForm } from "@/components/client-forms";
import { requireUser } from "@/lib/supabase/server";
import { Loading } from "@/components/loading";
import { formatMoney } from "@/lib/billing";
import { ClientTypeFields } from "@/components/client-type-fields";
import { RequiredNote } from "@/components/required-note";
import { CLIENT_TYPES, CLIENT_TYPE_LABELS, recordLabel, type Client, type ClientType } from "@/lib/types";

export default function ClientsPage() {
  return (
    <>
      <h1 className="h1 mb-4">Clients</h1>
      <AddClientForm>
        <ClientFields idPrefix="new" />
      </AddClientForm>
      <Suspense fallback={<Loading />}>
        <ClientList />
      </Suspense>
    </>
  );
}

async function ClientList() {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("clients").select("*, tickets(count)").order("name");
  if (error) throw new Error(error.message);
  const clients = (data ?? []) as (Client & { tickets: { count: number }[] })[];
  if (clients.length === 0) return <p className="card text-center text-slate-500">No clients yet.</p>;

  return (
    <div className="space-y-6">
      {CLIENT_TYPES.map((type) => {
        const group = clients.filter((c) => (c.client_type ?? "hourly") === type);
        return (
          <section key={type}>
            <h2 className="h2 mb-2">{CLIENT_TYPE_LABELS[type]} clients ({group.length})</h2>
            {group.length === 0 ? (
              <p className="text-sm text-slate-500">None yet.</p>
            ) : (
              <ul className="space-y-2">
                {group.map((c) => (
                  <li key={c.id} className="card">
                    <details>
                      <summary className="cursor-pointer">
                        <span className="font-semibold">{c.name}</span>
                        {c.internal && <span className="ml-2 rounded bg-slate-200 px-1.5 text-xs font-semibold text-slate-700">Our company</span>}
                        <span className="text-sm text-slate-500">
                          {c.phone ? ` · ${c.phone}` : ""}
                          {c.client_type === "contract" && c.monthly_fee_cents > 0 ? ` · ${formatMoney(c.monthly_fee_cents)}/month` : ""} · {ticketCount(c.tickets[0]?.count ?? 0, c.client_type)}
                        </span>
                      </summary>
                      <EditClientForm clientId={c.id}>
                        <ClientFields idPrefix={c.id} client={c} />
                      </EditClientForm>
                      <div className="mt-3 border-t border-slate-200 pt-3">
                        {(c.tickets[0]?.count ?? 0) === 0 ? (
                          <DeleteClientButton clientId={c.id} name={c.name} />
                        ) : (
                          <p className="text-sm text-slate-500">
                            This client has {ticketCount(c.tickets[0].count, c.client_type)}, so it can&apos;t be deleted.
                          </p>
                        )}
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function ticketCount(n: number, type: ClientType) {
  const label = recordLabel(type).toLowerCase();
  return n === 1 ? `1 ${label}` : `${n} ${label}s`;
}

function ClientFields({ idPrefix, client }: { idPrefix: string; client?: Client }) {
  return (
    <>
      <RequiredNote className="sm:col-span-2" />
      <Field idPrefix={idPrefix} name="name" label="Name" value={client?.name ?? ""} required />
      <Field idPrefix={idPrefix} name="phone" label="Phone" value={client?.phone ?? ""} type="tel" />
      <Field idPrefix={idPrefix} name="email" label="Email" value={client?.email ?? ""} type="email" />
      <Field idPrefix={idPrefix} name="address" label="Address" value={client?.address ?? ""} />
      <ClientTypeFields idPrefix={idPrefix} typeName="client_type" feeName="monthly_fee" type={client?.client_type} feeCents={client?.monthly_fee_cents} />
      <label className="flex items-start gap-2 text-sm sm:col-span-2">
        <input type="checkbox" name="internal" defaultChecked={client?.internal ?? false} className="mt-0.5 h-4 w-4" />
        <span>
          <span className="font-semibold">This is Swiftnet IT (our own company)</span>
          <span className="block text-slate-500">Time on its jobs is tracked, but never billed or counted as money made.</span>
        </span>
      </label>
    </>
  );
}

function Field(props: { idPrefix: string; name: string; label: string; value: string; type?: string; required?: boolean }) {
  const id = `${props.idPrefix}-${props.name}`;
  return (
    <div>
      <label className="label" htmlFor={id}>{props.label}</label>
      <input className="input" id={id} name={props.name} type={props.type ?? "text"} defaultValue={props.value} required={props.required} />
    </div>
  );
}
