/** The only account allowed to delete service tickets, calls and projects. */
export const OWNER_EMAIL = "david@swiftnetit.com";

export function isOwner(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase() === OWNER_EMAIL;
}

/** What a user may do, set per user in Settings > Users. Everything is allowed unless turned off; the owner can do everything. */
export type Permissions = { createJobs: boolean; timers: boolean; settings: boolean };

type AuthUser = { email?: string | null; app_metadata?: Record<string, unknown> } | null | undefined;

export function permissions(user: AuthUser): Permissions {
  if (isOwner(user?.email)) return { createJobs: true, timers: true, settings: true };
  const m = user?.app_metadata ?? {};
  return { createJobs: m.can_create_jobs !== false, timers: m.can_use_timers !== false, settings: m.can_manage_settings !== false };
}
