import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getProject } from "@/lib/data";
import { num } from "@/lib/decimal";
import { clauseRemaining } from "@/lib/projects";
import { EmptyState, PageHeader } from "@/components/ui";
import { PaymentForm } from "@/components/projects/PaymentForm";

export const metadata = { title: "Record payment" };

export default async function RecordPaymentPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();

  const stages = (project.clauses ?? [])
    .map((c, index) => ({ index, title: c.title, total: num(c.paymentAmount), remaining: clauseRemaining(c) }))
    .filter((s) => s.remaining > 0.01);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        back={{ href: `/portal/projects/${id}`, label: project.name }}
        eyebrow="Client payment"
        title={`Record payment - ${project.name}`}
        subtitle="Enter what's being collected now for each stage it covers. It doesn't need to be the full remaining amount; leave a stage blank to skip it."
      />
      {stages.length === 0 ? (
        <EmptyState icon="check" title="Nothing to collect" text={(project.clauses ?? []).length ? "Every stage on this project is already fully paid." : "Add payment stages to this project first."} />
      ) : (
        <PaymentForm projectId={id} stages={stages} />
      )}
    </div>
  );
}
