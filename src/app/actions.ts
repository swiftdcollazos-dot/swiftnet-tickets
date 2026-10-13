"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, requireUser } from "@/lib/supabase/server";
import { parseMoney } from "@/lib/billing";
import { localToIso } from "@/lib/time";
import type { TicketKind, TicketStatus } from "@/lib/types";

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const KINDS: TicketKind[] = ["service", "install", "will_call", "deliver"];
const STATUSES: TicketStatus[] = ["open", "completed", "paid"];

function fail(message: string): never {
  throw new Error(message);
}

// ---------- Login ----------

export type SignInState = { error: string; email: string } | null;

export async function signIn(_prev: SignInState, form: FormData): Promise<SignInState> {
  const supabase = await createClient();
  const email = text(form, "email");
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: String(form.get("password") ?? ""),
  });
  // Return the email so the form can keep it filled in after a failed attempt.
  if (error) return { error: "Wrong email or password.", email };
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// ---------- Tickets ----------

function ticketFields(form: FormData) {
  const kind = text(form, "kind") as TicketKind;
  return {
    ticket_date: text(form, "ticket_date") || undefined,
    kind: KINDS.includes(kind) ? kind : "service",
    is_estimate: form.get("is_estimate") === "on",
    item_to_service: text(form, "item_to_service"),
    make: text(form, "make"),
    model: text(form, "model"),
    labor_performed: text(form, "labor_performed"),
    date_wanted: text(form, "date_wanted") || null,
  };
}

export async function createTicket(form: FormData) {
  const { supabase, user } = await requireUser();

  let clientId = text(form, "client_id");
  if (!clientId) {
    const name = text(form, "client_name") || fail("Enter the client's name.");
    const { data, error } = await supabase
      .from("clients")
      .insert({
        name,
        phone: text(form, "client_phone"),
        email: text(form, "client_email"),
        address: text(form, "client_address"),
      })
      .select("id")
      .single();
    if (error) fail(error.message);
    clientId = data.id;
  }

  // Copy today's billing rules onto the ticket.
  const { data: s, error: settingsError } = await supabase.from("settings").select("*").single();
  if (settingsError) fail(settingsError.message);

  const { data: ticket, error } = await supabase
    .from("tickets")
    .insert({
      ...ticketFields(form),
      client_id: clientId,
      technician_id: user.id,
      hourly_rate_cents: s.hourly_rate_cents,
      tax_rate_pct: s.tax_rate_pct,
      tax_labor: s.tax_labor,
      rounding_minutes: s.rounding_minutes,
      minimum_minutes: s.minimum_minutes,
    })
    .select("id")
    .single();
  if (error) fail(error.message);

  revalidatePath("/");
  redirect(`/tickets/${ticket.id}`);
}

export async function updateTicket(ticketId: string, form: FormData) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("tickets").update(ticketFields(form)).eq("id", ticketId);
  if (error) fail(error.message);
  revalidatePath(`/tickets/${ticketId}`);
}

export async function setStatus(ticketId: string, status: TicketStatus) {
  if (!STATUSES.includes(status)) fail("Unknown status.");
  const { supabase } = await requireUser();
  const { error } = await supabase.from("tickets").update({ status }).eq("id", ticketId);
  if (error) fail(error.message);
  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/");
}

// ---------- Time ----------

export async function startTimer(ticketId: string) {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("time_entries").insert({
    ticket_id: ticketId,
    technician_id: user.id,
    started_at: new Date().toISOString(),
  });
  if (error) fail(error.message);
  revalidatePath(`/tickets/${ticketId}`);
}

export async function stopTimer(ticketId: string, entryId: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("time_entries")
    .update({ ended_at: new Date().toISOString() })
    .eq("id", entryId)
    .is("ended_at", null);
  if (error) fail(error.message);
  revalidatePath(`/tickets/${ticketId}`);
}

/** For time that wasn't tracked with the timer: date, time in, time out. */
export async function addTimeEntry(ticketId: string, form: FormData) {
  const { supabase, user } = await requireUser();
  const date = text(form, "date") || fail("Enter the date.");
  const startedAt = localToIso(date, text(form, "time_in") || fail("Enter the time in."));
  const endedAt = localToIso(date, text(form, "time_out") || fail("Enter the time out."));
  if (endedAt < startedAt) fail("Time out must be after time in.");
  const { error } = await supabase.from("time_entries").insert({
    ticket_id: ticketId,
    technician_id: user.id,
    started_at: startedAt,
    ended_at: endedAt,
  });
  if (error) fail(error.message);
  revalidatePath(`/tickets/${ticketId}`);
}

export async function deleteTimeEntry(ticketId: string, entryId: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("time_entries").delete().eq("id", entryId);
  if (error) fail(error.message);
  revalidatePath(`/tickets/${ticketId}`);
}

// ---------- Parts ----------

export async function addPart(ticketId: string, form: FormData) {
  const { supabase } = await requireUser();
  const qty = Number(text(form, "qty") || "1");
  const { error } = await supabase.from("ticket_parts").insert({
    ticket_id: ticketId,
    qty: Number.isFinite(qty) && qty > 0 ? qty : 1,
    part_number: text(form, "part_number"),
    description: text(form, "description") || fail("Enter a description."),
    unit_price_cents: parseMoney(text(form, "price")),
  });
  if (error) fail(error.message);
  revalidatePath(`/tickets/${ticketId}`);
}

export async function deletePart(ticketId: string, partId: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("ticket_parts").delete().eq("id", partId);
  if (error) fail(error.message);
  revalidatePath(`/tickets/${ticketId}`);
}

// ---------- Signature ----------

export async function saveSignature(ticketId: string, signedName: string, dataUrl: string) {
  if (!dataUrl.startsWith("data:image/png;base64,")) fail("Invalid signature.");
  if (dataUrl.length > 500_000) fail("Signature image is too large.");
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("tickets")
    .update({
      signature: dataUrl,
      signed_name: signedName.trim() || null,
      signed_at: new Date().toISOString(),
    })
    .eq("id", ticketId);
  if (error) fail(error.message);
  revalidatePath(`/tickets/${ticketId}`);
}

export async function clearSignature(ticketId: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("tickets")
    .update({ signature: null, signed_name: null, signed_at: null })
    .eq("id", ticketId);
  if (error) fail(error.message);
  revalidatePath(`/tickets/${ticketId}`);
}

// ---------- Clients ----------

export async function updateClient(clientId: string, form: FormData) {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("clients")
    .update({
      name: text(form, "name") || fail("Enter the client's name."),
      phone: text(form, "phone"),
      email: text(form, "email"),
      address: text(form, "address"),
    })
    .eq("id", clientId);
  if (error) fail(error.message);
  revalidatePath("/clients");
}

// ---------- Settings ----------

export async function updateSettings(form: FormData) {
  const { supabase } = await requireUser();
  const num = (key: string, fallback: number) => {
    const n = Number(text(form, key));
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };
  const { error } = await supabase
    .from("settings")
    .update({
      company_name: text(form, "company_name"),
      company_phone: text(form, "company_phone"),
      company_email: text(form, "company_email"),
      company_address: text(form, "company_address"),
      hourly_rate_cents: parseMoney(text(form, "hourly_rate")),
      tax_rate_pct: num("tax_rate_pct", 0),
      tax_labor: form.get("tax_labor") === "on",
      rounding_minutes: Math.round(num("rounding_minutes", 15)),
      minimum_minutes: Math.round(num("minimum_minutes", 0)),
      terms: text(form, "terms"),
      disclaimer: text(form, "disclaimer"),
    })
    .eq("id", 1);
  if (error) fail(error.message);
  revalidatePath("/settings");
}
