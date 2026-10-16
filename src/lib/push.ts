import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordLabel, type ClientType } from "@/lib/types";
import { VAPID_PUBLIC_KEY } from "@/lib/vapid";

/** Every phone with notifications on hears about a new job, whoever created it. Never throws. */
export async function notifyNewJob(ticketId: string) {
  await send(ticketId, null, (label) => `New ${label} created`);
}

/** Tells the new technician when a job is reassigned to them (not when they took it themselves). Never throws. */
export async function notifyAssignee(ticketId: string, assigneeId: string | null, actorId: string) {
  if (!assigneeId || assigneeId === actorId) return;
  await send(ticketId, assigneeId, (label) => `${label[0].toUpperCase()}${label.slice(1)} assigned to you`);
}

/** Sends a test to the signed-in user's devices and says what happened, for troubleshooting. */
export async function sendTestPush(userId: string): Promise<string> {
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const admin = createAdminClient();
  if (!privateKey) return "The server has no VAPID_PRIVATE_KEY. Add it in Vercel, then redeploy.";
  if (!admin) return "The server has no SUPABASE_SERVICE_ROLE_KEY.";
  const { data: subs, error } = await admin.from("push_subscriptions").select("endpoint, p256dh, auth").eq("user_id", userId);
  if (error) return `Couldn't read devices: ${error.message}`;
  if (!subs?.length) return "No devices are turned on for your login. Tap Turn on notifications on this phone first.";
  webpush.setVapidDetails("mailto:david@swiftnetit.com", VAPID_PUBLIC_KEY, privateKey);
  const payload = JSON.stringify({ title: "Swiftnet test notification", body: "Notifications are working on this device.", url: "/dashboard" });
  const results = await Promise.all(
    subs.map((s) =>
      webpush
        .sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 600 })
        .then(() => "sent")
        .catch((e: { statusCode?: number; body?: string; message?: string }) => `failed (${e.statusCode ?? ""} ${e.body || e.message || ""})`.trim()),
    ),
  );
  return `${subs.length} device(s): ${results.join(", ")}.`;
}

/** Sends to one user's devices, or to every device when `userId` is null. */
async function send(ticketId: string, userId: string | null, title: (label: string) => string) {
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const admin = createAdminClient();
  if (!privateKey || !admin) return;
  try {
    let subsQuery = admin.from("push_subscriptions").select("endpoint, p256dh, auth");
    if (userId) subsQuery = subsQuery.eq("user_id", userId);
    const [{ data: subs }, { data: ticket }] = await Promise.all([
      subsQuery,
      admin.from("tickets").select("number, is_project, clients(name, client_type)").eq("id", ticketId).single(),
    ]);
    if (!subs?.length || !ticket) return;
    const client = ticket.clients as unknown as { name: string; client_type: ClientType } | null;
    const payload = JSON.stringify({
      title: title(recordLabel(client?.client_type ?? "hourly", ticket.is_project).toLowerCase()),
      body: `#${ticket.number} · ${client?.name ?? ""}`,
      url: `/tickets/${ticketId}`,
    });
    webpush.setVapidDetails("mailto:david@swiftnetit.com", VAPID_PUBLIC_KEY, privateKey);
    await Promise.all(
      subs.map((s) =>
        webpush
          .sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400 })
          .catch(async (e: { statusCode?: number }) => {
            // The phone turned notifications off or the app was removed: forget that device.
            if (e.statusCode === 404 || e.statusCode === 410) await admin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
            else console.error("Push notification failed", e);
          }),
      ),
    );
  } catch (e) {
    console.error("Push notification failed", e);
  }
}
