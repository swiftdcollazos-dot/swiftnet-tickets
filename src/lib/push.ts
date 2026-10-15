import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordLabel, type ClientType } from "@/lib/types";
import { VAPID_PUBLIC_KEY } from "@/lib/vapid";

/**
 * Sends "assigned to you" to every device the assignee turned notifications on for.
 * Nobody is told about a job they assigned to themselves. Never throws.
 */
export async function notifyAssignee(ticketId: string, assigneeId: string | null, actorId: string) {
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const admin = createAdminClient();
  if (!assigneeId || assigneeId === actorId || !privateKey || !admin) return;
  try {
    const [{ data: subs }, { data: ticket }] = await Promise.all([
      admin.from("push_subscriptions").select("endpoint, p256dh, auth").eq("user_id", assigneeId),
      admin.from("tickets").select("number, is_project, clients(name, client_type)").eq("id", ticketId).single(),
    ]);
    if (!subs?.length || !ticket) return;
    const client = ticket.clients as unknown as { name: string; client_type: ClientType } | null;
    const payload = JSON.stringify({
      title: `New ${recordLabel(client?.client_type ?? "hourly", ticket.is_project).toLowerCase()} assigned to you`,
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
