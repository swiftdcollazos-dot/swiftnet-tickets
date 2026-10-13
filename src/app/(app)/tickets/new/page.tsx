import { Suspense } from "react";
import { createTicket } from "@/app/actions";
import { requireUser } from "@/lib/supabase/server";
import { todayLocal } from "@/lib/time";
import { ClientPicker } from "@/components/client-picker";
import { TicketFields } from "@/components/ticket-fields";
import { Loading } from "@/components/loading";
import type { Client } from "@/lib/types";

export default function NewTicketPage() {
  return (
    <>
      <h1 className="h1 mb-4">New service ticket</h1>
      <Suspense fallback={<Loading />}>
        <NewTicketForm />
      </Suspense>
    </>
  );
}

async function NewTicketForm() {
  const { supabase } = await requireUser();
  const { data: clients } = await supabase.from("clients").select("*").order("name");
  return (
    <form action={createTicket} className="space-y-4">
      <section className="card">
        <ClientPicker clients={(clients ?? []) as Client[]} />
      </section>
      <section className="card">
        <TicketFields today={todayLocal()} />
      </section>
      <button className="btn w-full">Create service ticket</button>
    </form>
  );
}
