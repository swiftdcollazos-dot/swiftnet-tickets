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
