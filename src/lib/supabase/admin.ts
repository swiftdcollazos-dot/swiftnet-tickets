import { createClient } from "@supabase/supabase-js";

/**
 * Supabase client with the secret (service role) key, for managing logins.
 * Server-only. Returns null until SUPABASE_SERVICE_ROLE_KEY is set on the server.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
