"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { notifyAssignee, notifyNewJob, sendTestPush } from "@/lib/push";
import { createClient, requireUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatMoney, parseMoney } from "@/lib/billing";
import { formatDate, localToIso, todayLocal } from "@/lib/time";
import { isOwner, permissions, type Permissions } from "@/lib/owner";
import { scanReceiptImage, type ScannedReceipt } from "@/lib/receipt-scan";
import { TOT_CATEGORY, TOT_VENDOR, totFor } from "@/lib/tot";
import { BILLING_BLOCK_MINUTES, CLIENT_TYPES, EXPENSE_CATEGORIES, PAYMENT_METHODS, RENEWAL_KINDS, REPEATS, VEHICLE_CATEGORY, VEHICLES, RENEWAL_REPEATS, TOT_RATE_PCT, kindValue, type ClientType, type TicketStatus } from "@/lib/types";

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const STATUSES: TicketStatus[] = ["open", "completed", "sent", "paid"];

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

export type ResetState = { error: string } | { sent: string } | null;

/** Emails a link to choose a new password. Says the same thing whether or not the email has an account. */
export async function sendPasswordReset(_prev: ResetState, form: FormData): Promise<ResetState> {
  const email = text(form, "email");
  if (!email) return { error: "Enter your email." };
  const h = await headers();
  const origin = h.get("origin") ?? `https://${h.get("host")}`;
  // Implicit flow, so the emailed link works on any device, not only the browser that asked for it.
  const supabase = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false },
  });
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/login/reset` });
  if (error) return { error: `Couldn't send the email: ${error.message}` };
  return { sent: email };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// ---------- Tickets ----------

type Supabase = Awaited<ReturnType<typeof requireUser>>["supabase"];

/** Signs in and checks the user may do this (see Settings > Users). */
async function requireAllowed(what: keyof Permissions) {
  const session = await requireUser();
  if (!permissions(session.user)[what]) fail(NOT_ALLOWED[what]);
  return session;
}

const NOT_ALLOWED: Record<keyof Permissions, string> = {
  createJobs: "Your account can't create service tickets or service calls.",
  timers: "Your account can't run timers or change time.",
  settings: "Your account can't change settings or users.",
  reports: "Your account can't see reports.",
  expenses: "Your account can't use Expenses.",
  office: "Your account can't use the Office section.",
};

/** Closed and paid tickets are locked; only reopening changes them. */
async function assertOpen(supabase: Supabase, ticketId: string) {
  const { data, error } = await supabase.from("tickets").select("status").eq("id", ticketId).single();
  if (error) fail(error.message);
  if (data.status !== "open") fail("This service ticket is closed. Reopen it to make changes.");
}

function ticketFields(form: FormData) {
  // Special projects leave out the item, device and issue fields; keep whatever is stored.
  const optional = (key: string) => (form.has(key) ? text(form, key) : undefined);
  return {
    ticket_date: text(form, "ticket_date") || undefined,
    kind: kindValue(form.getAll("kind").map(String)),
    item_to_service: optional("item_to_service"),
    make: optional("make"),
    model: optional("model"),
    machine_name: optional("machine_name"),
    contacted_by: text(form, "contacted_by"),
    service_request: optional("service_request"),
    labor_performed: text(form, "labor_performed"),
    // Only service calls have "Repeats".
    repeats: form.has("repeats") ? (text(form, "repeats") in REPEATS ? text(form, "repeats") : "") : undefined,
    // Only the job page's details form has "Assigned to".
    technician_id: form.get("technician_id") ? text(form, "technician_id") : undefined,
  };
}

export async function createTicket(form: FormData) {
  const { supabase, user } = await requireUser();
  const isServiceCall = text(form, "is_service_call") === "1";
  // Special projects work like service tickets (hourly clients), listed on their own tab.
  const isProject = !isServiceCall && text(form, "is_project") === "1";
  if (!isProject && !permissions(user).createJobs) fail(NOT_ALLOWED.createJobs);

  const clientId = text(form, "client_id") || fail("Select a client.");
  const { data: client, error: clientError } = await supabase.from("clients").select("client_type").eq("id", clientId).single();
  if (clientError) fail(clientError.message);
  if (isServiceCall && client.client_type !== "contract") fail("Service calls are only for contract clients.");
  if (!isServiceCall && !isProject && client.client_type === "contract") fail("Contract clients get service calls, not service tickets.");

  // Copy today's billing rules onto the ticket.
  const { data: s, error: settingsError } = await supabase.from("settings").select("*").single();
  if (settingsError) fail(settingsError.message);

  const fields = ticketFields(form);
  const { data: ticket, error } = await supabase
    .from("tickets")
    .insert({
      ...fields,
      client_id: clientId,
      is_project: isProject,
      // Assigned to whoever the form picked, the creator by default.
      technician_id: fields.technician_id ?? user.id,
      created_by: user.id,
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

  after(() => notifyNewJob(ticket.id));
  revalidatePath("/", "layout"); // pending count in the header
  redirect(`/tickets/${ticket.id}`);
}

export async function updateTicket(ticketId: string, form: FormData) {
  const { supabase, user } = await requireUser();
  await assertOpen(supabase, ticketId);
  const fields = ticketFields(form);
  const { data: before } = await supabase.from("tickets").select("technician_id").eq("id", ticketId).single();
  const { error } = await supabase.from("tickets").update(fields).eq("id", ticketId);
  if (error) fail(error.message);
  // Tell the new technician when the job is handed to them.
  if (fields.technician_id && fields.technician_id !== before?.technician_id) {
    const assignee = fields.technician_id;
    after(() => notifyAssignee(ticketId, assignee, user.id));
  }
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
    supabase.from("tickets").select("is_project, clients(client_type)").eq("id", ticketId).single(),
    supabase.from("clients").select("client_type").eq("id", clientId).single(),
  ]);
  if (ticketError) fail(ticketError.message);
  if (clientError) fail(clientError.message);
  const currentType = (ticket.clients as unknown as { client_type: string } | null)?.client_type;
  if (move && client.client_type === currentType) {
    fail(currentType === "contract" ? "Pick an hourly client to make this a service ticket." : "Pick a contract client to make this a service call.");
  }
  // Special projects can be for any client.
  if (!move && !ticket.is_project && currentType && client.client_type !== currentType) {
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
  // Remember the day it was paid, for the TOT on Reports; a job already paid keeps its day.
  const { error } =
    status === "paid"
      ? await supabase.from("tickets").update({ status, paid_on: todayLocal() }).eq("id", ticketId).neq("status", "paid")
      : await supabase.from("tickets").update({ status, paid_on: null }).eq("id", ticketId);
  if (error) fail(error.message);
  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/", "layout"); // pending count in the header
}

/** Stops any running timer and marks the ticket closed, so it can no longer be edited. */
export async function closeTicket(ticketId: string) {
  const { supabase, user } = await requireUser();
  const { data: job } = await supabase.from("tickets").select("repeats").eq("id", ticketId).single();
  if (job?.repeats) fail("This job repeats, so it stays open. Set Repeats to No first to close it.");
  // Closing stops the timers, so another technician's running timer has to be stopped by them first.
  if (!isOwner(user.email)) {
    const { data: others } = await supabase.from("time_entries").select("id").eq("ticket_id", ticketId).is("ended_at", null).neq("technician_id", user.id).limit(1);
    if (others?.length) fail("Another technician's timer is still running on this job. They need to stop it before it can be closed.");
  }
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
  const { supabase, user } = await requireAllowed("timers");
  await assertOpen(supabase, ticketId);
  // One timer per technician per job; other technicians can run their own at the same time.
  const { data: mine } = await supabase
    .from("time_entries")
    .select("id")
    .eq("ticket_id", ticketId)
    .eq("technician_id", user.id)
    .is("ended_at", null)
    .limit(1);
  if (mine?.length) return;
  const { error } = await supabase.from("time_entries").insert({
    ticket_id: ticketId,
    technician_id: user.id,
    started_at: new Date().toISOString(),
  });
  if (error) fail(error.message);
  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/", "layout"); // running-timers bar
}

/** Only the technician who started a timer can stop it (the owner can stop any, e.g. one left running). */
async function assertOwnTimer(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], user: { id: string; email?: string }, entryId: string) {
  if (isOwner(user.email)) return;
  const { data } = await supabase.from("time_entries").select("technician_id, ended_at").eq("id", entryId).maybeSingle();
  if (data && !data.ended_at && data.technician_id !== user.id) fail("Only the technician running this timer can stop it.");
}

export async function stopTimer(ticketId: string, entryId: string) {
  const { supabase, user } = await requireAllowed("timers");
  await assertOwnTimer(supabase, user, entryId);
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
/** Which timers are running right now, as a short string that changes whenever one starts or stops. */
export async function runningTimersKey(): Promise<string> {
  const { supabase } = await requireUser();
  const { data } = await supabase.from("time_entries").select("id").is("ended_at", null).order("id");
  return (data ?? []).map((e) => e.id).join(",");
}

export async function addTimeEntry(ticketId: string, form: FormData) {
  const { supabase, user } = await requireAllowed("timers");
  await assertOpen(supabase, ticketId);
  const date = text(form, "date") || fail("Enter the date.");
  const startedAt = localToIso(date, text(form, "time_in") || fail("Enter the time in."));
  const endedAt = localToIso(date, text(form, "time_out") || fail("Enter the time out."));
  if (endedAt < startedAt) fail("Time out must be after time in.");
  const { error } = await supabase.from("time_entries").insert({
    ticket_id: ticketId,
    technician_id: text(form, "technician_id") || user.id,
    started_at: startedAt,
    ended_at: endedAt,
  });
  if (error) fail(error.message);
  revalidatePath(`/tickets/${ticketId}`);
}

export async function deleteTimeEntry(ticketId: string, entryId: string) {
  const { supabase, user } = await requireAllowed("timers");
  await assertOpen(supabase, ticketId);
  await assertOwnTimer(supabase, user, entryId);
  const { error } = await supabase.from("time_entries").delete().eq("id", entryId);
  if (error) fail(error.message);
  revalidatePath(`/tickets/${ticketId}`);
  revalidatePath("/", "layout"); // running-timers bar
}

// ---------- Parts ----------

function partFields(form: FormData) {
  const qty = Number(text(form, "qty") || "1");
  return {
    qty: Number.isFinite(qty) && qty > 0 ? qty : 1,
    part_number: text(form, "part_number"),
    description: text(form, "description") || fail("Enter a description."),
    unit_price_cents: parseMoney(text(form, "price")),
  };
}

export async function addPart(ticketId: string, form: FormData) {
  const { supabase } = await requireUser();
  await assertOpen(supabase, ticketId);
  const { error } = await supabase.from("ticket_parts").insert({ ticket_id: ticketId, ...partFields(form) });
  if (error) fail(error.message);
  revalidatePath(`/tickets/${ticketId}`);
}

export async function updatePart(ticketId: string, partId: string, form: FormData) {
  const { supabase } = await requireUser();
  await assertOpen(supabase, ticketId);
  const { error } = await supabase.from("ticket_parts").update(partFields(form)).eq("id", partId);
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

/** Remote or on-site, chosen next to the signature; choosing the same one again clears it. */
export async function setServiceLocation(ticketId: string, location: string) {
  const { supabase } = await requireUser();
  await assertOpen(supabase, ticketId);
  const value = location === "remote" || location === "onsite" ? location : "";
  const { error } = await supabase.from("tickets").update({ service_location: value }).eq("id", ticketId);
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
      internal: form.get("internal") === "on",
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
        internal: form.get("internal") === "on",
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

/** Deletes a service ticket, call or project with its time and parts. Owner only. */
export async function deleteTicket(ticketId: string): Promise<ClientResult> {
  const { supabase, user } = await requireUser();
  if (!isOwner(user.email)) return { error: "Only the owner can delete jobs." };
  const { data: ticket, error } = await supabase
    .from("tickets")
    .delete()
    .eq("id", ticketId)
    .select("is_project, clients(client_type)")
    .single();
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  const contract = (ticket.clients as unknown as { client_type: string } | null)?.client_type === "contract";
  redirect(ticket.is_project ? "/projects" : contract ? "/?view=calls" : "/");
}

// ---------- Notifications ----------

/** Remembers this device so jobs assigned to the signed-in user show up as notifications on it. */
export async function savePushSubscription(sub: { endpoint: string; keys: { p256dh: string; auth: string } }) {
  const { supabase, user } = await requireUser();
  if (!sub?.endpoint?.startsWith("https://") || !sub.keys?.p256dh || !sub.keys?.auth) fail("Invalid subscription.");
  const { error } = await supabase
    .from("push_subscriptions")
    .upsert({ endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, user_id: user.id }, { onConflict: "endpoint" });
  if (error) fail(error.message);
}

export async function testPushNotification(): Promise<string> {
  const { user } = await requireUser();
  return sendTestPush(user.id);
}

export async function deletePushSubscription(endpoint: string) {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  if (error) fail(error.message);
}

// ---------- Settings ----------

export async function updateSettings(form: FormData) {
  const { supabase } = await requireAllowed("settings");
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

/** The permission checkboxes on the user forms. */
function permissionFields(form: FormData) {
  return {
    can_create_jobs: form.has("can_create_jobs"),
    can_use_timers: form.has("can_use_timers"),
    can_manage_settings: form.has("can_manage_settings"),
    can_see_reports: form.has("can_see_reports"),
    can_use_expenses: form.has("can_use_expenses"),
    can_see_office: form.has("can_see_office"),
  };
}

export async function createUser(_prev: ClientResult, form: FormData): Promise<ClientResult> {
  return userAction(async () => {
    await requireAllowed("settings");
    const admin = createAdminClient() ?? fail(NO_ADMIN_KEY);
    const fullName = text(form, "full_name") || fail("Enter the person's name.");
    const email = text(form, "email") || fail("Enter an email address.");
    const { error } = await admin.auth.admin.createUser({
      email,
      password: password(form, true),
      email_confirm: true,
      user_metadata: { full_name: fullName },
      app_metadata: permissionFields(form),
    });
    if (error) fail(error.message);
  });
}

/** Saves the name and email, and the password when a new one was typed. */
export async function updateUser(userId: string, _prev: ClientResult, form: FormData): Promise<ClientResult> {
  return userAction(async () => {
    const { supabase } = await requireAllowed("settings");
    const admin = createAdminClient() ?? fail(NO_ADMIN_KEY);
    const fullName = text(form, "full_name") || fail("Enter the person's name.");
    const email = text(form, "email") || fail("Enter an email address.");
    const { error } = await admin.auth.admin.updateUserById(userId, {
      email,
      email_confirm: true,
      password: password(form, false),
      user_metadata: { full_name: fullName },
      app_metadata: permissionFields(form),
    });
    if (error) fail(error.message);
    const { error: profileError } = await supabase.from("profiles").update({ full_name: fullName }).eq("id", userId);
    if (profileError) fail(profileError.message);
  });
}

// ---------- Expenses (owner only) ----------

/** The Office section: the owner, and users given "See Office" in Settings > Users. */
function requireOffice() {
  return requireAllowed("office");
}

/** A receipt is a compressed JPEG photo or a PDF, as a data URL. */
const isReceipt = (dataUrl: string) =>
  (dataUrl.startsWith("data:image/jpeg;base64,") || dataUrl.startsWith("data:application/pdf;base64,")) && dataUrl.length <= 3_000_000;

/** Reads a receipt photo and returns the fields to fill in, or an error to show. Nothing is saved. */
export async function scanReceipt(dataUrl: string): Promise<ScannedReceipt | { error: string }> {
  await requireAllowed("expenses");
  if (!isReceipt(dataUrl)) return { error: "That file couldn't be used. Please try another." };
  try {
    return await scanReceiptImage(dataUrl, todayLocal());
  } catch (e) {
    console.error("scanReceipt", e);
    return { error: "The scan didn't work this time. Please try again or fill it in by hand." };
  }
}

function expenseFields(form: FormData) {
  const category = text(form, "category");
  const method = text(form, "payment_method");
  const vehicle = text(form, "vehicle");
  const receipt = text(form, "receipt");
  const slip = text(form, "card_slip");
  const spentOn = text(form, "spent_on");
  return {
    spent_on: /^\d{4}-\d{2}-\d{2}$/.test(spentOn) ? spentOn : todayLocal(),
    vendor: text(form, "vendor"),
    category: (EXPENSE_CATEGORIES as readonly string[]).includes(category) ? category : "Other",
    description: text(form, "description"),
    amount_cents: parseMoney(text(form, "amount")),
    tax_cents: parseMoney(text(form, "tax")),
    payment_method: (PAYMENT_METHODS as readonly string[]).includes(method) ? method : "",
    vehicle: category === VEHICLE_CATEGORY && (VEHICLES as readonly string[]).includes(vehicle) ? vehicle : "",
    receipt: isReceipt(receipt) ? receipt : null,
    card_slip: isReceipt(slip) ? slip : null,
  };
}

/** The invoice items from the expense form; each can be charged to a customer with a 10–25% markup. */
function expenseItems(form: FormData) {
  let raw: unknown;
  try {
    raw = JSON.parse(text(form, "items") || "[]");
  } catch {
    fail("The items couldn't be read. Please try again.");
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .map((it, position) => {
      const client = typeof it?.bill_client_id === "string" ? it.bill_client_id : "";
      const markup = Number(it?.markup_pct);
      return {
        position,
        description: String(it?.description ?? "").trim(),
        amount_cents: parseMoney(String(it?.amount ?? "")),
        bill_client_id: client || null,
        markup_pct: client && [10, 15, 20, 25].includes(markup) ? markup : 0,
        charged: !!client && it?.charged === true,
        ticket_id: client && typeof it?.ticket_id === "string" && /^[0-9a-f-]{36}$/i.test(it.ticket_id) ? it.ticket_id : null,
      };
    })
    .filter((it) => it.description || it.amount_cents);
}

/**
 * Looks for an expense already entered with the same date and total, so the same invoice isn't added twice.
 * Checks everyone's expenses (two people can turn in the same receipt), but only says what it matched.
 */
export async function findDuplicateExpense(spentOn: string, amount: string, excludeId: string | null): Promise<string | null> {
  const { supabase } = await requireAllowed("expenses");
  const cents = parseMoney(amount);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(spentOn) || cents <= 0) return null;
  const db = createAdminClient() ?? supabase;
  let query = db.from("expenses").select("id, vendor, created_by").eq("spent_on", spentOn).eq("amount_cents", cents).limit(1);
  if (excludeId) query = query.neq("id", excludeId);
  const { data } = await query;
  const match = data?.[0];
  if (!match) return null;
  const { data: who } = match.created_by ? await db.from("profiles").select("full_name").eq("id", match.created_by).maybeSingle() : { data: null };
  return `${match.vendor || "An expense"} on ${formatDate(spentOn)} for ${formatMoney(cents)} is already entered${who?.full_name ? ` by ${who.full_name}` : ""}.`;
}

export async function saveExpense(id: string | null, form: FormData) {
  const { supabase } = await requireAllowed("expenses");
  const fields = expenseFields(form);
  const items = expenseItems(form);
  if (!fields.vendor) fail("Please enter where it was purchased from.");
  if (!fields.payment_method) fail("Please pick what it was paid with.");
  // Both photos travel in one request, which can't be much over 4 MB.
  if ((fields.receipt?.length ?? 0) + (fields.card_slip?.length ?? 0) > 3_600_000) fail("The receipt and card slip are too big together. Try a photo of the receipt instead of the PDF.");
  let expenseId = id;
  if (id) {
    // Keep the saved receipt and card slip unless a new photo was taken or it was removed.
    const { receipt, card_slip, ...rest } = fields;
    const { error } = await supabase
      .from("expenses")
      .update({
        ...rest,
        ...(text(form, "receipt") === "keep" ? {} : { receipt }),
        ...(text(form, "card_slip") === "keep" ? {} : { card_slip }),
      })
      .eq("id", id);
    if (error) fail(error.message);
  } else {
    // The form sends a fresh id; saving the same one again does nothing, so double taps don't duplicate.
    const newId = text(form, "new_id");
    const row = /^[0-9a-f-]{36}$/i.test(newId) ? { id: newId, ...fields } : fields;
    const { data, error } = await supabase.from("expenses").upsert(row, { onConflict: "id", ignoreDuplicates: true }).select("id");
    if (error) fail(error.message);
    expenseId = data?.[0]?.id ?? null; // null when this was a repeated tap that saved nothing
  }
  // An item can only go on a job of the customer it's charged to.
  const jobIds = [...new Set(items.map((it) => it.ticket_id).filter((t): t is string => !!t))];
  if (jobIds.length) {
    const { data: jobs } = await supabase.from("tickets").select("id, client_id").in("id", jobIds);
    const owner = new Map((jobs ?? []).map((j) => [j.id as string, j.client_id as string]));
    for (const it of items) if (it.ticket_id && owner.get(it.ticket_id) !== it.bill_client_id) it.ticket_id = null;
  }
  if (expenseId) {
    // The form always sends the whole list, so replace what was saved.
    const { error: delError } = await supabase.from("expense_items").delete().eq("expense_id", expenseId);
    if (delError) fail(delError.message);
    if (items.length) {
      const { error: itemsError } = await supabase.from("expense_items").insert(items.map((it) => ({ ...it, expense_id: expenseId })));
      if (itemsError) fail(itemsError.message);
    }
  }
  revalidatePath("/expenses");
  revalidatePath("/office/charges");
  for (const jobId of jobIds) revalidatePath(`/tickets/${jobId}`);
  redirect(`/expenses?month=${fields.spent_on.slice(0, 7)}`);
}

/** Office > Charge customers: marks an invoice item as sent to its customer (or undoes it). */
export async function markChargeSent(id: string, sent: boolean) {
  const { supabase } = await requireOffice();
  const { error } = await supabase.from("expense_items").update({ charged: sent }).eq("id", id);
  if (error) fail(error.message);
  revalidatePath("/office/charges");
  revalidatePath("/expenses");
}

export async function deleteExpense(id: string) {
  const { supabase } = await requireAllowed("expenses");
  const { error } = await supabase.from("expenses").delete().eq("id", id);
  if (error) fail(error.message);
  revalidatePath("/expenses");
  redirect("/expenses");
}

// ---------- Renewals (owner only) ----------

function renewalFields(form: FormData) {
  const kind = text(form, "kind");
  const repeat = Number(text(form, "repeat_months"));
  const due = text(form, "due_on");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) fail("Please pick the date it's due.");
  return {
    client_id: text(form, "client_id") || null,
    kind: (RENEWAL_KINDS as readonly string[]).includes(kind) ? kind : "Other",
    name: text(form, "name"),
    due_on: due,
    repeat_months: RENEWAL_REPEATS.some(([m]) => m === repeat) ? repeat : 12,
    cost_cents: parseMoney(text(form, "cost")),
    notes: text(form, "notes"),
  };
}

export async function saveRenewal(id: string | null, form: FormData) {
  const { supabase } = await requireOffice();
  const fields = renewalFields(form);
  if (!fields.name) fail("Please say what renews, e.g. the domain name or the license.");
  const { error } = id
    ? await supabase.from("renewals").update(fields).eq("id", id)
    : await supabase.from("renewals").insert(fields);
  if (error) fail(error.message);
  revalidatePath("/office/renewals");
}

/** Marks it renewed: moves the date forward by its repeat, or removes a one-time item. */
export async function markRenewed(id: string) {
  const { supabase } = await requireOffice();
  const { data, error } = await supabase.from("renewals").select("due_on, repeat_months").eq("id", id).single();
  if (error) fail(error.message);
  if (data.repeat_months > 0) {
    const [y, m, d] = (data.due_on as string).split("-").map(Number);
    // Keep the day, but not past the end of a shorter month (Jan 31 + 1 month = Feb 28).
    const target = new Date(Date.UTC(y, m - 1 + data.repeat_months, 1));
    const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    target.setUTCDate(Math.min(d, lastDay));
    const { error: e } = await supabase.from("renewals").update({ due_on: target.toISOString().slice(0, 10) }).eq("id", id);
    if (e) fail(e.message);
  } else {
    const { error: e } = await supabase.from("renewals").delete().eq("id", id);
    if (e) fail(e.message);
  }
  revalidatePath("/office/renewals");
}

export async function deleteRenewal(id: string) {
  const { supabase } = await requireOffice();
  const { error } = await supabase.from("renewals").delete().eq("id", id);
  if (error) fail(error.message);
  revalidatePath("/office/renewals");
}

/** Reports: approves a month's TOT and records it (or updates it) as an expense on the month's last day. Owner only. */
export async function recordTot(monthStart: string) {
  const { supabase, user } = await requireUser();
  if (!isOwner(user.email)) fail("Only the owner can approve the TOT.");
  if (!/^\d{4}-\d{2}-01$/.test(monthStart)) fail("Invalid month.");
  const [y, m] = monthStart.split("-").map(Number);
  const monthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const tot = await totFor(supabase, monthStart, monthEnd);
  const monthName = new Date(`${monthStart}T00:00:00Z`).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const fields = {
    amount_cents: tot.totCents,
    description: `TOT ${TOT_RATE_PCT}% for ${monthName} on ${formatMoney(tot.jobsCents + tot.feesCents)} received`,
  };
  const { data: existing } = await supabase.from("expenses").select("id").eq("vendor", TOT_VENDOR).eq("category", TOT_CATEGORY).eq("spent_on", monthEnd).maybeSingle();
  const { error } = existing
    ? await supabase.from("expenses").update(fields).eq("id", existing.id)
    : await supabase.from("expenses").insert({ ...fields, spent_on: monthEnd, vendor: TOT_VENDOR, category: TOT_CATEGORY, payment_method: "Swiftnet IT account" });
  if (error) fail(error.message);
  revalidatePath("/reports");
  revalidatePath("/expenses");
  revalidatePath("/office");
}

/** Office > Contract payments: marks a contract client's fee for a month as paid, or not paid. */
export async function setContractPaid(clientId: string, month: string, amountCents: number, paid: boolean) {
  const { supabase } = await requireOffice();
  if (!/^\d{4}-\d{2}$/.test(month)) fail("Invalid month.");
  const { error } = paid
    ? await supabase.from("contract_payments").upsert({ client_id: clientId, month, amount_cents: amountCents, paid_on: todayLocal() })
    : await supabase.from("contract_payments").delete().eq("client_id", clientId).eq("month", month);
  if (error) fail(error.message);
  // The monthly fee pays for that month's closed service calls (standing jobs stay open).
  const [y, m] = month.split("-").map(Number);
  const nextMonth = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
  const { error: callsError } = await supabase
    .from("tickets")
    .update({ status: paid ? "paid" : "completed", paid_on: paid ? todayLocal() : null })
    .eq("client_id", clientId)
    .eq("is_project", false)
    .in("status", paid ? ["completed", "sent"] : ["paid"])
    .gte("ticket_date", `${month}-01`)
    .lt("ticket_date", `${nextMonth}-01`);
  if (callsError) fail(callsError.message);
  revalidatePath("/", "layout");
  revalidatePath("/office/contracts");
  revalidatePath("/office");
}
