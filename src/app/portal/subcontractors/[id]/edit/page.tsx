import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getSubcontractor, isActiveSub } from "@/lib/subcontractors";
import { PageHeader } from "@/components/ui";
import { SubcontractorForm } from "@/components/subcontractors/SubcontractorForm";

export const metadata = { title: "Edit subcontractor" };

export default async function EditSubcontractorPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const s = await getSubcontractor(id);
  if (!s) notFound();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader back={{ href: `/portal/subcontractors/${id}`, label: s.name }} eyebrow="Edit" title="Subcontractor details" />
      <SubcontractorForm
        id={id}
        initial={{
          name: s.name ?? "",
          tradeSpecialty: s.tradeSpecialty ?? "",
          contactPerson: s.contactPerson ?? "",
          phone: s.phone ?? "",
          email: s.email ?? "",
          address: s.address ?? "",
          notes: s.notes ?? "",
          status: isActiveSub(s) ? "Active" : "Inactive",
        }}
      />
    </div>
  );
}
