import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { num } from "@/lib/decimal";
import { omr } from "@/lib/format";
import { agreementPaid, agreementRemaining, getSubcontractor, isActiveSub, listAgreements } from "@/lib/subcontractors";
import { EmptyState, PageHeader, StatCard, StatusPill } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { DeleteSubcontractorButton } from "@/components/subcontractors/SubButtons";

export const metadata = { title: "Subcontractor" };

export default async function SubcontractorPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const [s, all] = await Promise.all([getSubcontractor(id), listAgreements()]);
  if (!s) notFound();
  const mine = all.filter((a) => a.agreement.subcontractorId === id);
  const committed = mine.reduce((t, a) => t + num(a.agreement.agreementValue), 0);
  const paid = mine.reduce((t, a) => t + agreementPaid(a.agreement), 0);

  const info: Array<[string, string]> = [
    ["Contact person", s.contactPerson],
    ["Phone", s.phone],
    ["Email", s.email],
    ["Address", s.address],
  ];

  return (
    <>
      <PageHeader
        back={{ href: "/portal/subcontractors", label: "Subcontractors" }}
        eyebrow={s.tradeSpecialty || "Subcontractor"}
        title={s.name}
        subtitle={isActiveSub(s) ? "Active" : "Inactive"}
        action={<Link href={`/portal/subcontractors/${id}/edit`} className="btn-ghost py-3">Edit details</Link>}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard tone="navy" icon="projects" label="Projects" value={String(mine.length)} hint={`${mine.filter((a) => (a.agreement.status ?? "").toLowerCase() === "active").length} active`} />
        <StatCard icon="trend" label="Committed" value={omr(Math.round(committed))} hint="Excl. VAT" />
        <StatCard tone="orange" icon="wallet" label="Paid" value={omr(Math.round(paid))} hint="Excl. VAT" />
        <StatCard icon="clock" label="Remaining" value={omr(Math.round(Math.max(0, committed - paid)))} />
      </div>

      <section className="card mt-6 grid gap-x-6 sm:grid-cols-2">
        {info.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 border-b border-line px-6 py-3.5 sm:block">
            <p className="text-sm text-muted">{k}</p>
            <p className="font-semibold">{v || "—"}</p>
          </div>
        ))}
        {s.notes && (
          <div className="px-6 py-4 sm:col-span-2">
            <p className="text-sm text-muted">Notes</p>
            <p className="whitespace-pre-line">{s.notes}</p>
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-4 font-display text-xl font-bold">Project agreements</h2>
        {mine.length === 0 ? (
          <EmptyState icon="projects" title="No agreements yet" text="Open a project and use Add agreement to give this subcontractor work on it." />
        ) : (
          <ul className="space-y-3">
            {mine.map(({ projectId, projectName, projectStatus, agreement }) => (
              <li key={projectId} className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/portal/projects/${projectId}`} className="font-bold hover:text-accent">{projectName}</Link>
                    <StatusPill status={projectStatus} />
                  </div>
                  <p className="text-sm text-muted">
                    Agreement {omr(Math.round(num(agreement.agreementValue)))} · paid {omr(Math.round(agreementPaid(agreement)))} · remaining {omr(Math.round(agreementRemaining(agreement)))} · {(agreement.clauses ?? []).length} stages
                  </p>
                </div>
                <div className="flex gap-2">
                  <Link className="btn-ghost px-3 py-2" href={`/portal/projects/${projectId}/subcontractors/${id}`}>Stages</Link>
                  <a className="btn-dark px-3 py-2" href={`/api/subcontract?project=${projectId}&sub=${id}&print=1`} target="_blank" rel="noopener"><Icon name="file" className="h-4 w-4" /> Contract</a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-12 rounded-3xl border border-red-200 bg-red-50/40 p-5">
        <h2 className="font-display text-lg font-bold text-red-800">Danger zone</h2>
        <p className="mb-4 mt-1 text-sm text-red-900/70">Set the status to Inactive to stop using a subcontractor but keep them listed.</p>
        <DeleteSubcontractorButton id={id} name={s.name} agreementCount={mine.length} />
      </section>
    </>
  );
}
