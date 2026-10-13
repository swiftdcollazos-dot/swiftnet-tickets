"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, requireUser } from "@/lib/supabase/server";
import { parseMoney } from "@/lib/billing";
import { localToIso } from "@/lib/time";
import { BILLING_BLOCK_MINUTES, CLIENT_TYPES, type ClientType, type TicketKind, type TicketStatus } from "@/lib/types";

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const KINDS: TicketKind[] = ["service", "install", "will_call", "deliver"];
const STATUSES: TicketStatus[] = ["open", "completed", "paid"];

function fail(message: string): never {
  throw new Error(message);
}

function clientType(form: FormData, key: string): ClientType {
  const value = text(form, key) as ClientType;
  return CLIENT_TYPES.includes(value) ? value : "hourly";
}

/** The monthly fee only applies to contract clients. */
function monthlyFee(form: FormData, typeKey: string, feeKey: string): number {
  return clientType(form, typeKey) === "contract" ? parseMoney(text(form, feeKey)) : 0;
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

type Supabase = Awaited<ReturnType<typeof requireUser>>["supabase"];

/** Closed and paid tickets are locked; only reopening changes them. */
async function assertOpen(supabase: Supabase, ticketId: string) {
  const { data, error } = await supabase.from("tickets").select("status").eq("id", ticketId).single();
  if (error) fail(error.message);
  if (data.status !== "open") fail("This service ticket is closed. Reopen it to make changes.");
}

function ticketFields(form: FormData) {
  const kind = text(form, "kind") as TicketKind;
  return {
    ticket_date: text(form, "ticket_date") || undefined,
    kind: KINDS.includes(kind) ? kind : "service",
    item_to_service: text(form, "item_to_service"),
    make: text(form, "make"),
    model: text(form, "model"),
    labor_performed: text(form, "labor_performed"),
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
        client_type: clientType(form, "client_type"),
        monthly_fee_cents: monthlyFee(form, "client_type", "client_monthly_fee"),
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
      // Swiftnet does not charge tax on service tickets.
      tax_rate_pct: 0,
      tax_labor: false,
      rounding_minutes: BILLING_BLOCK_MINUTES,
      minimum_minutes: BILLING_BLOCK_MINUTES,
    })
    .select("id")
    .single();
  if (error) fail(error.message);

  revalidatePath("/");
  redirect(`/tickets/${ticket.id}`);
}

export async function updateTicket(ticketId: string, form: FormData) {
  const { supabase } = await requireUser();
  await assertOpen(supabase, ticketId);
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

/** Stops any running timer and marks the ticket closed, so it can no longer be edited. */
export async function closeTicket(ticketId: string) {
  const { supabase } = await requireUser();
  const { error: timerError } = await supabase
    .from("time_entries")
    .update({ ended_at: new Date().toISOString() })
    .eq("ticket_id", ticketId)
    .is("ended_at", null);
  if (timerError) fail(timerError.message);
  const { error } = await supabase.from("tickets").update({ status: "completed" }).eq("id", ticketId);
  if (error) fail(error.message);
  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/");
}

// ---------- Time ----------

export async function startTimer(ticketId: string) {
  const { supabase, user } = await requireUser();
  await assertOpen(supabase, ticketId);
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
  await assertOpen(supabase, ticketId);
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
  await assertOpen(supabase, ticketId);
  const { error } = await supabase.from("time_entries").delete().eq("id", entryId);
  if (error) fail(error.message);
  revalidatePath(`/tickets/${ticketId}`);
}

// ---------- Parts ----------

export async function addPart(ticketId: string, form: FormData) {
  const { supabase } = await requireUser();
  await assertOpen(supabase, ticketId);
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
  await assertOpen(supabase, ticketId);
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
  await assertOpen(supabase, ticketId);
  const { error } = await supabase
    .from("tickets")
    .update({ signature: null, signed_name: null, signed_at: null })
    .eq("id", ticketId);
  if (error) fail(error.message);
  revalidatePath(`/tickets/${ticketId}`);
}

// ---------- Clients ----------

export async function createClientRecord(form: FormData) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("clients").insert({
    name: text(form, "name") || fail("Enter the client's name."),
    phone: text(form, "phone"),
    email: text(form, "email"),
    address: text(form, "address"),
    client_type: clientType(form, "client_type"),
    monthly_fee_cents: monthlyFee(form, "client_type", "monthly_fee"),
  });
  if (error) fail(error.message);
  revalidatePath("/clients");
}

export async function updateClient(clientId: string, form: FormData) {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("clients")
    .update({
      name: text(form, "name") || fail("Enter the client's name."),
      phone: text(form, "phone"),
      email: text(form, "email"),
      address: text(form, "address"),
      client_type: clientType(form, "client_type"),
      monthly_fee_cents: monthlyFee(form, "client_type", "monthly_fee"),
    })
    .eq("id", clientId);
  if (error) fail(error.message);
  revalidatePath("/clients");
}

/** Only clients without service tickets can be deleted, so no service ticket loses its client. */
export async function deleteClient(clientId: string) {
  const { supabase } = await requireUser();
  const { count, error: countError } = await supabase
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId);
  if (countError) fail(countError.message);
  if (count) fail("This client has service tickets, so it can't be deleted.");
  const { error } = await supabase.from("clients").delete().eq("id", clientId);
  if (error) fail(error.message);
  revalidatePath("/clients");
}

// ---------- Settings ----------

export async function updateSettings(form: FormData) {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("settings")
    .update({
      company_name: text(form, "company_name"),
      company_phone: text(form, "company_phone"),
      company_email: text(form, "company_email"),
      company_address: text(form, "company_address"),
      hourly_rate_cents: parseMoney(text(form, "hourly_rate")),
      terms: text(form, "terms"),
      disclaimer: text(form, "disclaimer"),
    })
    .eq("id", 1);
  if (error) fail(error.message);
  revalidatePath("/settings");
}
