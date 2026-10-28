import { ReceiptView } from "@/components/receipt-view";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { requireUser } from "@/lib/supabase/server";
import { permissions } from "@/lib/owner";
import { todayLocal } from "@/lib/time";
import { deleteExpense, saveExpense } from "@/app/actions";
import { DeleteExpenseButton, ExpenseForm } from "@/components/expense-form";
import { Loading } from "@/components/loading";
import { jobOptions } from "@/lib/job-options";
import type { Expense, ExpenseItem } from "@/lib/types";

// Reading a receipt can take a little while.
export const maxDuration = 60;

export default function ExpensePage(props: PageProps<"/expenses/[id]">) {
  return (
    <>
      <h1 className="h1 mb-4">Expense</h1>
      <Suspense fallback={<Loading />}>
        <EditExpense params={props.params} />
      </Suspense>
    </>
  );
}

async function EditExpense({ params }: { params: PageProps<"/expenses/[id]">["params"] }) {
  // Techs can only open their own expenses; the database returns nothing for anyone else's.
  const { supabase, user } = await requireUser();
  if (!permissions(user).expenses) redirect("/dashboard");
  const { id } = await params;
  const [{ data }, { data: items }, { data: clients }] = await Promise.all([
    supabase.from("expenses").select("*").eq("id", id).maybeSingle(),
    supabase.from("expense_items").select("*").eq("expense_id", id).order("position"),
    supabase.from("clients").select("id, name").order("name"),
  ]);
  if (!data) redirect("/expenses");
  const jobs = await jobOptions(supabase, ((items ?? []) as ExpenseItem[]).map((it) => it.ticket_id).filter((t): t is string => !!t));
  const expense = data as Expense & { created_by: string | null };
  const { data: addedBy } = expense.created_by
    ? await supabase.from("profiles").select("full_name").eq("id", expense.created_by).maybeSingle()
    : { data: null };

  return (
    <div className="space-y-4">
      {addedBy?.full_name && (
        <p className="text-sm text-slate-500">
          Added by <span className="font-semibold text-slate-700">{addedBy.full_name}</span>
        </p>
      )}
      {expense.receipt && (
        <div className="card">
          <ReceiptView receipt={expense.receipt} large />
        </div>
      )}
      <div className="card">
        <ExpenseForm expense={expense} items={(items ?? []) as ExpenseItem[]} today={todayLocal()} clients={clients ?? []} jobs={jobs} save={saveExpense.bind(null, expense.id)} />
      </div>
      <DeleteExpenseButton remove={deleteExpense.bind(null, expense.id)} />
    </div>
  );
}
