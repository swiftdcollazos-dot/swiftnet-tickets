import { Suspense } from "react";
import { updateSettings } from "@/app/actions";
import { requireUser } from "@/lib/supabase/server";
import { Loading } from "@/components/loading";
import type { Settings } from "@/lib/types";

export default function SettingsPage() {
  return (
    <>
      <h1 className="h1 mb-1">Settings</h1>
      <p className="mb-4 text-sm text-slate-500">
        Changes apply to new tickets. Existing tickets keep the rate and tax they were created with.
      </p>
      <Suspense fallback={<Loading />}>
        <SettingsForm />
      </Suspense>
    </>
  );
}

async function SettingsForm() {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.from("settings").select("*").single();
  if (error) throw new Error(error.message);
  const s = data as Settings;

  return (
    <form action={updateSettings} className="space-y-4">
      <section className="card grid gap-3 sm:grid-cols-2">
        <h2 className="h2 sm:col-span-2">Billing</h2>
        <Field name="hourly_rate" label="Hourly rate ($)" value={(s.hourly_rate_cents / 100).toFixed(2)} decimal />
        <Field name="tax_rate_pct" label="Tax rate (%)" value={String(s.tax_rate_pct)} decimal />
        <Field name="rounding_minutes" label="Round time up to (minutes)" value={String(s.rounding_minutes)} decimal />
        <Field name="minimum_minutes" label="Minimum charge (minutes)" value={String(s.minimum_minutes)} decimal />
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="tax_labor" defaultChecked={s.tax_labor} className="size-4" />
          Charge tax on labor too (unchecked = tax on parts only)
        </label>
      </section>
      <section className="card grid gap-3 sm:grid-cols-2">
        <h2 className="h2 sm:col-span-2">Company (printed on tickets)</h2>
        <Field name="company_name" label="Company name" value={s.company_name} />
        <Field name="company_phone" label="Phone" value={s.company_phone} />
        <Field name="company_email" label="Email" value={s.company_email} />
        <Field name="company_address" label="Address" value={s.company_address} />
        <div className="sm:col-span-2">
          <label className="label" htmlFor="terms">Terms</label>
          <textarea className="input" rows={2} id="terms" name="terms" defaultValue={s.terms} />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="disclaimer">Disclaimer</label>
          <textarea className="input" rows={3} id="disclaimer" name="disclaimer" defaultValue={s.disclaimer} />
        </div>
      </section>
      <button className="btn w-full">Save settings</button>
    </form>
  );
}

function Field(props: { name: string; label: string; value: string; decimal?: boolean }) {
  return (
    <div>
      <label className="label" htmlFor={props.name}>{props.label}</label>
      <input className="input" id={props.name} name={props.name} defaultValue={props.value} inputMode={props.decimal ? "decimal" : undefined} />
    </div>
  );
}
