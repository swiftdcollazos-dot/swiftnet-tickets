import { redirect } from "next/navigation";
import { Suspense } from "react";
import { requireUser } from "@/lib/supabase/server";
import { permissions } from "@/lib/owner";
import { todayLocal } from "@/lib/time";
import { deleteExpense, saveExpense } from "@/app/actions";
import { DeleteExpenseButton, ExpenseForm } from "@/components/expense-form";
import { Loading } from "@/components/loading";
import type { Expense } from "@/lib/types";

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
  const { data } = await supabase.from("expenses").select("*").eq("id", id).maybeSingle();
  if (!data) redirect("/expenses");
  const expense = data as Expense;

  return (
    <div className="space-y-4">
      {expense.receipt && (
        <div className="card">
          {/* eslint-disable-next-line @next/next/no-img-element -- a data URL, nothing for next/image to optimize */}
          <img src={expense.receipt} alt="Receipt" className="mx-auto max-h-[70vh] rounded" />
        </div>
      )}
      <div className="card">
        <ExpenseForm expense={expense} today={todayLocal()} save={saveExpense.bind(null, expense.id)} />
      </div>
      <DeleteExpenseButton remove={deleteExpense.bind(null, expense.id)} />
    </div>
  );
}
