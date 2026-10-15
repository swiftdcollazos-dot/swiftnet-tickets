import { Suspense } from "react";
import { createTicket } from "@/app/actions";
import { requireUser } from "@/lib/supabase/server";
import { todayLocal } from "@/lib/time";
import { ClientPicker } from "@/components/client-picker";
import { ContactedByField, TicketFields } from "@/components/ticket-fields";
import { Loading } from "@/components/loading";
import type { Client } from "@/lib/types";

export default function NewTicketPage(props: PageProps<"/tickets/new">) {
  return (
    <Suspense fallback={<Loading />}>
      <NewTicketForm searchParams={props.searchParams} />
    </Suspense>
  );
}

async function NewTicketForm({ searchParams }: { searchParams: PageProps<"/tickets/new">["searchParams"] }) {
  const params = await searchParams;
  const serviceCall = params.call === "1";
  const project = !serviceCall && params.project === "1";
  const label = serviceCall ? "service call" : project ? "special project" : "service ticket";
  const { supabase } = await requireUser();
  // Service calls are for contract clients, service tickets for hourly clients, special projects for anyone.
  let clientQuery = supabase.from("clients").select("*").order("name");
  if (!project) clientQuery = clientQuery.eq("client_type", serviceCall ? "contract" : "hourly");
  const { data: clients } = await clientQuery;
  return (
    <>
      <h1 className="h1 mb-1">New {label}</h1>
      {serviceCall && <p className="mb-4 text-sm text-slate-500">For contract clients. Time is tracked, not charged.</p>}
      <form action={createTicket} className="mt-4 space-y-4">
        {serviceCall && <input type="hidden" name="is_service_call" value="1" />}
        {project && <input type="hidden" name="is_project" value="1" />}
        <section className="card">
          <ClientPicker clients={(clients ?? []) as Client[]} serviceCall={serviceCall} />
          <div className="mt-3">
            <ContactedByField />
          </div>
        </section>
        <section className="card">
          <TicketFields today={todayLocal()} withContactedBy={false} project={project} />
        </section>
        <button className="btn w-full">Create {label}</button>
      </form>
    </>
  );
}
