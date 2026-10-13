import { Suspense } from "react";
import { updateClient } from "@/app/actions";
import { AddClientForm } from "@/components/add-client-form";
import { requireUser } from "@/lib/supabase/server";
import { Loading } from "@/components/loading";
import { formatMoney } from "@/lib/billing";
import { ClientTypeFields } from "@/components/client-type-fields";
import { CLIENT_TYPES, CLIENT_TYPE_LABELS, type Client } from "@/lib/types";

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
                        <span className="text-sm text-slate-500">
                          {c.phone ? ` · ${c.phone}` : ""}
                          {c.client_type === "contract" && c.monthly_fee_cents > 0 ? ` · ${formatMoney(c.monthly_fee_cents)}/month` : ""} · {ticketCount(c.tickets[0]?.count ?? 0)}
                        </span>
                      </summary>
                      <form action={updateClient.bind(null, c.id)} className="mt-3 grid gap-3 sm:grid-cols-2">
                        <ClientFields idPrefix={c.id} client={c} />
                        <button className="btn sm:col-span-2">Save</button>
                      </form>
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

function ticketCount(n: number) {
  return n === 1 ? "1 service ticket" : `${n} service tickets`;
}

function ClientFields({ idPrefix, client }: { idPrefix: string; client?: Client }) {
  return (
    <>
      <Field idPrefix={idPrefix} name="name" label="Name" value={client?.name ?? ""} required />
      <Field idPrefix={idPrefix} name="phone" label="Phone" value={client?.phone ?? ""} type="tel" />
      <Field idPrefix={idPrefix} name="email" label="Email" value={client?.email ?? ""} type="email" />
      <Field idPrefix={idPrefix} name="address" label="Address" value={client?.address ?? ""} />
      <ClientTypeFields idPrefix={idPrefix} typeName="client_type" feeName="monthly_fee" type={client?.client_type} feeCents={client?.monthly_fee_cents} />
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
