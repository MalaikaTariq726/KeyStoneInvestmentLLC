import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getProject } from "@/lib/data";
import { omr } from "@/lib/format";
import { clauseRemaining } from "@/lib/projects";
import { EmptyState, PageHeader } from "@/components/ui";
import { StageInvoicePicker } from "@/components/projects/InvoiceButtons";

export const metadata = { title: "Print invoice" };

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();
  const stages = (project.clauses ?? []).map((c, index) => ({ index, title: c.title, status: c.status, outstanding: `${omr(Math.round(clauseRemaining(c)))} + VAT` }));

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        back={{ href: `/portal/projects/${id}`, label: project.name }}
        eyebrow="Invoice"
        title={`Print invoice - ${project.name}`}
        subtitle="Bills what is still outstanding on the selected stages, plus 5% VAT. Each invoice gets the next number and is kept in the invoice history."
        action={<Link className="btn-ghost" href={`/portal/projects/${id}/invoices`}>Invoice history</Link>}
      />
      {stages.length === 0 ? (
        <EmptyState icon="file" title="No stages yet" text="Add payment stages before printing an invoice." action={<Link className="btn-primary" href={`/portal/projects/${id}/stages`}>Add stages</Link>} />
      ) : (
        <StageInvoicePicker projectId={id} stages={stages} />
      )}
    </div>
  );
}
