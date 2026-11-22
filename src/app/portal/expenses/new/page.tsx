import { requireAdmin } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { EntryForm } from "@/components/EntryForm";

export const metadata = { title: "Add general expense" };

export default async function NewGeneralExpensePage() {
  await requireAdmin();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader back={{ href: "/portal/expenses", label: "General expenses" }} eyebrow="New expense" title="Add a general expense" />
      <EntryForm mode="expense" projects={[]} successHref="/portal/expenses" />
    </div>
  );
}
