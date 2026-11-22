import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { listGeneralExpenses } from "@/lib/data";
import { omr } from "@/lib/format";
import { totalAmount } from "@/lib/models";
import { EmptyState, PageHeader } from "@/components/ui";
import { ExpenseList } from "@/components/ExpenseList";
import { Icon } from "@/components/Icon";

export const metadata = { title: "General expenses" };

export default async function ExpensesPage() {
  await requireAdmin();
  const expenses = await listGeneralExpenses();
  const total = expenses.reduce((s, e) => s + totalAmount(e), 0);

  return (
    <>
      <PageHeader
        eyebrow="Company"
        title="General expenses"
        subtitle={`Expenses not tied to a project · ${omr(Math.round(total))} in total`}
        action={
          <Link href="/portal/expenses/new" className="btn-primary py-3">
            <Icon name="plus" className="h-5 w-5" strokeWidth={2.4} /> Add expense
          </Link>
        }
      />
      <p className="mb-5 text-sm text-muted">Project expenses live on each project&apos;s page. <Link className="font-bold text-accent" href="/portal/projects">Go to projects</Link></p>
      {expenses.length === 0 ? (
        <EmptyState icon="expenses" title="No general expenses" text="Office rent, vehicles and other company costs will show up here." />
      ) : (
        <ExpenseList
          rows={expenses.map((e) => ({
            key: e._id.toHexString(),
            title: e.title,
            type: e.type,
            amount: e.amount,
            includesVat: e.includesVat,
            taxPercent: e.taxPercent,
            transactionDate: e.transactionDate,
            addedByUserName: e.addedByUserName,
            sourceClaimId: e.sourceClaimId,
            attachmentCount: e.attachmentCount,
            attachmentNames: e.attachmentNames,
            files: { kind: "general", id: e._id.toHexString() },
          }))}
        />
      )}
    </>
  );
}
