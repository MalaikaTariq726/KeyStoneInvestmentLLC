import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getProject } from "@/lib/data";
import { num } from "@/lib/decimal";
import { contractBase } from "@/lib/projects";
import { PageHeader } from "@/components/ui";
import { StagesEditor, type StageRow } from "@/components/projects/StagesEditor";

export const metadata = { title: "Payment stages" };

export default async function StagesPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ new?: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const { new: isNewParam } = await searchParams;
  const project = await getProject(id);
  if (!project) notFound();

  const clauses = project.clauses ?? [];
  const isNew = clauses.length === 0;
  const initial: StageRow[] = clauses.map((c) => {
    const isAmount = (c.paymentType ?? "").toLowerCase() === "amount";
    const paid = (c.payments ?? []).reduce((s, p) => s + num(p.amount), 0);
    return {
      title: c.title,
      paymentType: isAmount ? "Amount" : "Percentage",
      value: String(Number((isAmount ? num(c.paymentAmount) : num(c.percentage)).toFixed(6))),
      status: c.status,
      paidSoFar: paid,
    };
  });

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        back={{ href: `/portal/projects/${id}`, label: project.name }}
        eyebrow={isNewParam ? "Step 2 of 2" : "Payment stages"}
        title={isNew ? `Add stages for ${project.name}` : `Edit stages - ${project.name}`}
        subtitle="Each stage is a percentage or a fixed amount. Instalments already recorded stay attached to a stage as long as its title doesn't change."
      />
      <StagesEditor projectId={id} base={contractBase(num(project.contractValue))} initial={initial} isNew={isNew} />
    </div>
  );
}
