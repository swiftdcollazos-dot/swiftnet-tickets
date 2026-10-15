/** The only account allowed to delete service tickets, calls and projects. */
export const OWNER_EMAIL = "david@swiftnetit.com";

export function isOwner(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase() === OWNER_EMAIL;
}
