import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getProject } from "@/lib/data";
import { num } from "@/lib/decimal";
import { isActiveSub, listSubcontractors } from "@/lib/subcontractors";
import { EmptyState, PageHeader } from "@/components/ui";
import { AddAgreementForm } from "@/components/subcontractors/AddAgreementForm";

export const metadata = { title: "Add subcontractor agreement" };

export default async function AddAgreementPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const [project, subs] = await Promise.all([getProject(id), listSubcontractors()]);
  if (!project) notFound();

  // One agreement per subcontractor per project; only active subcontractors can be picked.
  const assigned = new Set((project.subcontractorAgreements ?? []).map((a) => a.subcontractorId));
  const options = subs.filter((s) => isActiveSub(s) && !assigned.has(s._id.toHexString())).map((s) => ({ id: s._id.toHexString(), name: s.name, trade: s.tradeSpecialty }));
  const committed = (project.subcontractorAgreements ?? []).reduce((s, a) => s + num(a.agreementValue), 0);
  const available = Math.max(0, num(project.contractValue) - committed);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader back={{ href: `/portal/projects/${id}`, label: project.name }} eyebrow="Subcontractor" title="Add agreement" subtitle="Pick who does the work and the agreed value. You'll set their payment stages next." />
      {options.length === 0 ? (
        <EmptyState
          icon="projects"
          title="No subcontractors available"
          text={subs.length ? "Every active subcontractor already has an agreement on this project." : "Add a subcontractor to the directory first."}
          action={<Link className="btn-primary" href="/portal/subcontractors/new">Add subcontractor</Link>}
        />
      ) : (
        <AddAgreementForm projectId={id} options={options} available={available} />
      )}
    </div>
  );
}
