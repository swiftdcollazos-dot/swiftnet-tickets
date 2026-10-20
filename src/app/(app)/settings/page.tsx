import { Suspense } from "react";
import { redirect } from "next/navigation";
import { permissions } from "@/lib/owner";
import { updateSettings } from "@/app/actions";
import { requireUser } from "@/lib/supabase/server";
import { Loading } from "@/components/loading";
import { AddUserForm, EditUserForm } from "@/components/user-forms";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Settings } from "@/lib/types";
import type { Permissions } from "@/lib/owner";

export default function SettingsPage() {
  return (
    <>
      <h1 className="h1 mb-1">Settings</h1>
      <p className="mb-4 text-sm text-slate-500">
        Changes apply to new service tickets. Existing service tickets keep the rate they were created with.
      </p>
      <Suspense fallback={<Loading />}>
        <SettingsForm />
        <Users />
      </Suspense>
    </>
  );
}

async function SettingsForm() {
  const { supabase, user } = await requireUser();
  if (!permissions(user).settings) redirect("/dashboard");
  const { data, error } = await supabase.from("settings").select("*").single();
  if (error) throw new Error(error.message);
  const s = data as Settings;

  return (
    <form action={updateSettings} className="space-y-4">
      <section className="card grid gap-3 sm:grid-cols-2">
        <h2 className="h2 sm:col-span-2">Billing</h2>
        <Field name="hourly_rate" label="Hourly rate ($)" value={(s.hourly_rate_cents / 100).toFixed(2)} decimal />
        <p className="self-end pb-2 text-sm text-slate-500">Time is billed in whole hours, with a one-hour minimum per service ticket.</p>
      </section>
      <section className="card grid gap-3 sm:grid-cols-2">
        <h2 className="h2 sm:col-span-2">Company (printed on service tickets)</h2>
        <Field name="company_name" label="Company name" value={s.company_name} />
        <Field name="company_phone" label="Phone" value={s.company_phone} />
        <Field name="company_email" label="Email" value={s.company_email} />
        <Field name="company_address" label="Address" value={s.company_address} />
      </section>
      <button className="btn w-full">Save settings</button>
    </form>
  );
}

/** People who can sign in. Needs the secret key on the server to read emails and set passwords. */
async function Users() {
  const { supabase, user: me } = await requireUser();
  const admin = createAdminClient();
  let users: { id: string; full_name: string; email: string; permissions: Permissions }[] = [];
  let problem = "";
  if (!admin) {
    problem = "To add users and change passwords here, add SUPABASE_SERVICE_ROLE_KEY to the app's settings in Vercel.";
  } else {
    const [{ data, error }, { data: profiles }] = await Promise.all([
      admin.auth.admin.listUsers({ perPage: 1000 }),
      supabase.from("profiles").select("id, full_name"),
    ]);
    if (error) problem = error.message;
    const names = new Map((profiles ?? []).map((p) => [p.id, p.full_name as string]));
    users = (data?.users ?? [])
      .map((u) => ({
        id: u.id,
        email: u.email ?? "",
        full_name: names.get(u.id) ?? String(u.user_metadata?.full_name ?? u.email ?? ""),
        permissions: permissions(u),
      }))
      .sort((a, b) => a.full_name.localeCompare(b.full_name));
  }

  return (
    <section className="card mt-4">
      <h2 className="h2">Users</h2>
      {problem ? (
        <p className="text-sm text-amber-700">{problem}</p>
      ) : (
        <>
          <ul className="divide-y divide-slate-100">
            {users.map((u) => (
              <li key={u.id} className="py-2">
                <details>
                  <summary className="cursor-pointer">
                    <span className="font-semibold">{u.full_name}</span>
                    <span className="text-sm text-slate-500"> · {u.email}{u.id === me.id ? " · you" : ""}</span>
                    {limits(u.permissions) && <span className="text-sm text-amber-700"> · {limits(u.permissions)}</span>}
                  </summary>
                  <EditUserForm user={u} />
                </details>
              </li>
            ))}
          </ul>
          <AddUserForm />
        </>
      )}
    </section>
  );
}

/** Short note of a user's limits, e.g. "no new tickets/calls, no timers", and whether they see reports. */
function limits(p: Permissions) {
  return [!p.createJobs && "no new tickets/calls", !p.timers && "no timers", !p.settings && "no settings", p.reports && "sees reports"].filter(Boolean).join(", ");
}

function Field(props: { name: string; label: string; value: string; decimal?: boolean }) {
  return (
    <div>
      <label className="label" htmlFor={props.name}>{props.label}</label>
      <input className="input" id={props.name} name={props.name} defaultValue={props.value} inputMode={props.decimal ? "decimal" : undefined} />
    </div>
  );
}
