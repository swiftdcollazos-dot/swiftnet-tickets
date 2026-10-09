import { Suspense } from "react";
import { updateClient } from "@/app/actions";
import { requireUser } from "@/lib/supabase/server";
import { Loading } from "@/components/loading";
import type { Client } from "@/lib/types";

export default function ClientsPage() {
  return (
    <>
      <h1 className="h1 mb-1">Clients</h1>
      <p className="mb-4 text-sm text-slate-500">New clients are added when you create a ticket.</p>
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
    <ul className="space-y-2">
      {clients.map((c) => (
        <li key={c.id} className="card">
          <details>
            <summary className="cursor-pointer">
              <span className="font-semibold">{c.name}</span>
              <span className="text-sm text-slate-500">
                {c.phone ? ` · ${c.phone}` : ""} · {c.tickets[0]?.count ?? 0} tickets
              </span>
            </summary>
            <form action={updateClient.bind(null, c.id)} className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field name="name" label="Name" value={c.name} required />
              <Field name="phone" label="Phone" value={c.phone} type="tel" />
              <Field name="email" label="Email" value={c.email} type="email" />
              <Field name="address" label="Address" value={c.address} />
              <button className="btn sm:col-span-2">Save</button>
            </form>
          </details>
        </li>
      ))}
    </ul>
  );
}

function Field(props: { name: string; label: string; value: string; type?: string; required?: boolean }) {
  const id = `${props.name}`;
  return (
    <div>
      <label className="label" htmlFor={id}>{props.label}</label>
      <input className="input" id={id} name={props.name} type={props.type ?? "text"} defaultValue={props.value} required={props.required} />
    </div>
  );
}
