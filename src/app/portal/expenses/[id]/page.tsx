import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getGeneralExpense } from "@/lib/data";
import { num } from "@/lib/decimal";
import { fileList, storedToDateInput, taxModeOf } from "@/lib/expenseForm";
import { PageHeader } from "@/components/ui";
import { ExpenseEditForm } from "@/components/projects/ExpenseEditForm";

export const metadata = { title: "Edit expense" };

export default async function EditGeneralExpensePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (id === "new") notFound();
  const expense = await getGeneralExpense(id);
  if (!expense) notFound();
  const back = "/portal/expenses";

  if (expense.sourceClaimId) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader back={{ href: back, label: "General expenses" }} title="This expense is locked" subtitle="It was created from an approved claim, so it stays as the record of that approval and can't be edited or deleted." />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader back={{ href: back, label: "General expenses" }} eyebrow="Edit expense" title={expense.title || "Expense"} />
      <ExpenseEditForm
        target={{ kind: "general", id }}
        backHref={back}
        initial={{
          title: expense.title,
          expenseType: expense.type,
          amount: String(num(expense.amount)),
          date: storedToDateInput(expense.transactionDate),
          taxMode: taxModeOf(expense.includesVat, expense.taxPercent),
          taxPercent: String(num(expense.taxPercent) || 5),
          files: fileList(expense.attachmentCount, expense.attachmentNames, (i) => `/api/files?kind=general&id=${id}&i=${i}`),
        }}
      />
    </div>
  );
}
