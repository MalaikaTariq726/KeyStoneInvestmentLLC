import { requireAdmin } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { SubcontractorForm } from "@/components/subcontractors/SubcontractorForm";

export const metadata = { title: "Add subcontractor" };

export default async function NewSubcontractorPage() {
  await requireAdmin();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader back={{ href: "/portal/subcontractors", label: "Subcontractors" }} eyebrow="New" title="Add subcontractor" />
      <SubcontractorForm />
    </div>
  );
}
