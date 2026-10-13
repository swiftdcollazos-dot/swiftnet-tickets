"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, requireUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseMoney } from "@/lib/billing";
import { localToIso } from "@/lib/time";
import { BILLING_BLOCK_MINUTES, CLIENT_TYPES, isServiceType, type ClientType, type TicketStatus } from "@/lib/types";

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
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
  redirect("/dashboard");
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
  const kind = text(form, "kind");
  return {
    ticket_date: text(form, "ticket_date") || undefined,
    kind: isServiceType(kind) ? kind : "",
    item_to_service: text(form, "item_to_service"),
    make: text(form, "make"),
    model: text(form, "model"),
    machine_name: text(form, "machine_name"),
    labor_performed: text(form, "labor_performed"),
  };
}

export async function createTicket(form: FormData) {
  const { supabase, user } = await requireUser();
  const isServiceCall = text(form, "is_service_call") === "1";

  const clientId = text(form, "client_id") || fail("Select a client.");
  const { data: client, error: clientError } = await supabase.from("clients").select("client_type").eq("id", clientId).single();
  if (clientError) fail(clientError.message);
  if (isServiceCall && client.client_type !== "contract") fail("Service calls are only for contract clients.");
  if (!isServiceCall && client.client_type === "contract") fail("Contract clients get service calls, not service tickets.");

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

  revalidatePath("/", "layout"); // pending count in the header
  redirect(`/tickets/${ticket.id}`);
}

export async function updateTicket(ticketId: string, form: FormData) {
  const { supabase } = await requireUser();
  await assertOpen(supabase, ticketId);
  const { error } = await supabase.from("tickets").update(ticketFields(form)).eq("id", ticketId);
  if (error) fail(error.message);
  revalidatePath(`/tickets/${ticketId}`);
}

/** Moves an open ticket to another client of the same type (hourly ↔ hourly, contract ↔ contract). */
/**
 * Changes the client. With `move`, the new client must be the other type, which turns a
 * service ticket into a service call (contract client) or a call into a ticket (hourly client).
 */
export async function changeTicketClient(ticketId: string, move: boolean, form: FormData) {
  const { supabase } = await requireUser();
  await assertOpen(supabase, ticketId);
  const clientId = text(form, "client_id") || fail("Select a client.");
  const [{ data: ticket, error: ticketError }, { data: client, error: clientError }] = await Promise.all([
    supabase.from("tickets").select("clients(client_type)").eq("id", ticketId).single(),
    supabase.from("clients").select("client_type").eq("id", clientId).single(),
  ]);
  if (ticketError) fail(ticketError.message);
  if (clientError) fail(clientError.message);
  const currentType = (ticket.clients as unknown as { client_type: string } | null)?.client_type;
  if (move && client.client_type === currentType) {
    fail(currentType === "contract" ? "Pick an hourly client to make this a service ticket." : "Pick a contract client to make this a service call.");
  }
  if (!move && currentType && client.client_type !== currentType) {
    fail(currentType === "contract" ? "Service calls are only for contract clients." : "Service tickets are only for hourly clients.");
  }
  const { error } = await supabase.from("tickets").update({ client_id: clientId }).eq("id", ticketId);
  if (error) fail(error.message);
  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/", "layout");
}

export async function setStatus(ticketId: string, status: TicketStatus) {
  if (!STATUSES.includes(status)) fail("Unknown status.");
  const { supabase } = await requireUser();
  const { error } = await supabase.from("tickets").update({ status }).eq("id", ticketId);
  if (error) fail(error.message);
  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/", "layout"); // pending count in the header
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
  revalidatePath("/", "layout"); // running-timers bar
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
  revalidatePath("/", "layout"); // running-timers bar
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
  revalidatePath("/", "layout"); // running-timers bar
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
  revalidatePath("/", "layout"); // running-timers bar
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

/**
 * Client actions return their error instead of throwing, because Next hides thrown
 * error messages in production and the person would only see "Something went wrong".
 */
export type ClientResult = { error: string } | { ok: true } | null;

async function clientAction(work: () => Promise<void>): Promise<ClientResult> {
  try {
    await work();
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  revalidatePath("/clients");
  return { ok: true };
}

export async function createClientRecord(_prev: ClientResult, form: FormData): Promise<ClientResult> {
  return clientAction(async () => {
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
  });
}

export async function updateClient(clientId: string, _prev: ClientResult, form: FormData): Promise<ClientResult> {
  return clientAction(async () => {
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
  });
}

/** Only clients without service tickets can be deleted, so no service ticket loses its client. */
export async function deleteClient(clientId: string): Promise<ClientResult> {
  return clientAction(async () => {
    const { supabase } = await requireUser();
    const { count, error: countError } = await supabase
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId);
    if (countError) fail(countError.message);
    if (count) fail("This client has service tickets, so it can't be deleted.");
    const { error } = await supabase.from("clients").delete().eq("id", clientId);
    if (error) fail(error.message);
  });
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
    })
    .eq("id", 1);
  if (error) fail(error.message);
  revalidatePath("/settings");
}

// ---------- Users (logins) ----------

const NO_ADMIN_KEY = "User management isn't switched on yet. Add SUPABASE_SERVICE_ROLE_KEY in Vercel first.";

function password(form: FormData, required: boolean) {
  const value = String(form.get("password") ?? "");
  if (!value && !required) return undefined;
  if (value.length < 8) fail("The password must be at least 8 characters.");
  return value;
}

async function userAction(work: () => Promise<void>): Promise<ClientResult> {
  try {
    await work();
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  revalidatePath("/settings");
  return { ok: true };
}

export async function createUser(_prev: ClientResult, form: FormData): Promise<ClientResult> {
  return userAction(async () => {
    await requireUser();
    const admin = createAdminClient() ?? fail(NO_ADMIN_KEY);
    const fullName = text(form, "full_name") || fail("Enter the person's name.");
    const email = text(form, "email") || fail("Enter an email address.");
    const { error } = await admin.auth.admin.createUser({
      email,
      password: password(form, true),
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error) fail(error.message);
  });
}

/** Saves the name and email, and the password when a new one was typed. */
export async function updateUser(userId: string, _prev: ClientResult, form: FormData): Promise<ClientResult> {
  return userAction(async () => {
    const { supabase } = await requireUser();
    const admin = createAdminClient() ?? fail(NO_ADMIN_KEY);
    const fullName = text(form, "full_name") || fail("Enter the person's name.");
    const email = text(form, "email") || fail("Enter an email address.");
    const { error } = await admin.auth.admin.updateUserById(userId, {
      email,
      email_confirm: true,
      password: password(form, false),
      user_metadata: { full_name: fullName },
    });
    if (error) fail(error.message);
    const { error: profileError } = await supabase.from("profiles").update({ full_name: fullName }).eq("id", userId);
    if (profileError) fail(profileError.message);
  });
}
