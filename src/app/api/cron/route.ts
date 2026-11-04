import { runScheduledPushes } from "@/lib/daily-push";

/**
 * Called every 5 minutes by the scheduler in Supabase (see setup/morning-push.sql) to send the 8 AM summary and the
 * heads-ups before timed jobs. Only callers with CRON_SECRET get in.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Not allowed." }, { status: 401 });
  }
  try {
    const sent = await runScheduledPushes();
    return Response.json({ ok: true, sent });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
