import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getProject } from "@/lib/data";
import { num } from "@/lib/decimal";
import { omr } from "@/lib/format";
import { PageHeader } from "@/components/ui";
import { SubStagesEditor, type SubStageRow } from "@/components/subcontractors/SubStagesEditor";

export const metadata = { title: "Agreement stages" };

const toStatus = (s: string): SubStageRow["status"] => {
  const x = (s ?? "").toLowerCase();
  if (x === "pending" || x === "processing" || x === "paid") return (x[0].toUpperCase() + x.slice(1)) as SubStageRow["status"];
  if (["processed", "closed", "payed"].includes(x)) return "Paid";
  if (x === "partially paid") return "Processing";
  return "Pending";
};

export default async function AgreementStagesPage({ params }: { params: Promise<{ id: string; subId: string }> }) {
  await requireAdmin();
  const { id, subId } = await params;
  const project = await getProject(id);
  const agreement = project?.subcontractorAgreements?.find((a) => a.subcontractorId === subId);
  if (!project || !agreement) notFound();
  const value = num(agreement.agreementValue);

  // The agreement's own stages first, then every project stage not on it yet, offered
  // unticked with the project's percentage - same as the desktop editor.
  const own: SubStageRow[] = (agreement.clauses ?? []).map((c) => {
    const isAmount = (c.paymentType ?? "").toLowerCase() === "amount";
    const status = toStatus(c.status);
    return { id: c.id, include: true, title: c.title, paymentType: isAmount ? "Amount" : "Percentage", value: String(Number((isAmount ? num(c.paymentAmount) : num(c.percentage)).toFixed(6))), status, wasPaid: status === "Paid" };
  });
  const ownTitles = new Set(own.map((r) => r.title.trim().toLowerCase()));
  const offered: SubStageRow[] = (project.clauses ?? [])
    .filter((c) => !ownTitles.has(c.title.trim().toLowerCase()))
    .map((c) => ({ include: false, title: c.title, paymentType: "Percentage", value: String(Number(num(c.percentage).toFixed(6))), status: "Pending", wasPaid: false, fromProject: true }));

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        back={{ href: `/portal/projects/${id}`, label: project.name }}
        eyebrow={`Agreement · ${omr(Math.round(value))} excl. VAT`}
        title={`${agreement.subcontractorName} - stages`}
        subtitle="Tick project stages to include them, or add your own. Edit titles, percentage or fixed amount, and statuses."
      />
      <SubStagesEditor projectId={id} subcontractorId={subId} agreementValue={value} initial={[...own, ...offered]} />
    </div>
  );
}
