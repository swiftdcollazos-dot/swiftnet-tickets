import { Suspense } from "react";
import { createTicket } from "@/app/actions";
import { requireUser } from "@/lib/supabase/server";
import { permissions } from "@/lib/owner";
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
  // From the Repeats tab: a service call that repeats every week unless changed.
  const repeat = serviceCall && params.repeat === "1";
  const project = !serviceCall && params.project === "1";
  const label = repeat ? "repeating job" : serviceCall ? "service call" : project ? "special project" : "service ticket";
  const { supabase, user } = await requireUser();
  if (!project && !permissions(user).createJobs) {
    return <p className="card text-center text-slate-500">Your account can&apos;t create service tickets or service calls. Ask David to change this in Settings.</p>;
  }
  // Service calls are for contract clients, service tickets for hourly clients, special projects for anyone.
  let clientQuery = supabase.from("clients").select("*").order("name");
  if (!project) clientQuery = clientQuery.eq("client_type", serviceCall ? "contract" : "hourly");
  const [{ data: clients }, { data: profiles }] = await Promise.all([
    clientQuery,
    supabase.from("profiles").select("id, full_name").order("full_name"),
  ]);
  const technicians = (profiles ?? []).map((p) => ({ id: p.id, name: p.full_name }));
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
          <TicketFields ticket={{ technician_id: user.id, repeats: repeat ? "weekly" : "" }} today={todayLocal()} withContactedBy={false} project={project} technicians={technicians} call={serviceCall} />
        </section>
        <button className="btn w-full">Create {label}</button>
      </form>
    </>
  );
}
