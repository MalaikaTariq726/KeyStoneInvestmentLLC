import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getClaim } from "@/lib/data";
import { num } from "@/lib/decimal";
import { fmtDate, omr } from "@/lib/format";
import { totalAmount } from "@/lib/models";
import { PageHeader, StatusPill } from "@/components/ui";
import { ClaimActions } from "@/components/ClaimActions";
import { Attachments } from "@/components/Attachments";
import { Icon } from "@/components/Icon";

export const metadata = { title: "Claim" };

export default async function ClaimPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ submitted?: string; saved?: string }> }) {
  const me = await requireUser();
  const { id } = await params;
  const { submitted, saved } = await searchParams;
  const claim = await getClaim(id);
  if (!claim || (!me.isAdmin && claim.userId !== me.id)) notFound();

  const pending = claim.status.toLowerCase() === "pending";
  const isProject = (claim.claimType ?? "").toLowerCase() === "project";
  const total = totalAmount(claim);
  const tax = num(claim.taxPercent);
  const taxLabel = tax <= 0 ? "No tax" : claim.includesVat ? `Incl. ${tax}% tax` : `Excl. ${tax}% tax`;

  const rows: Array<[string, React.ReactNode]> = [
    ["Raised by", claim.userName],
    ["Applies to", claim.projectName || "General"],
    ["Expense type", claim.expenseType?.trim() || "User Claim"],
    ["Claim date", fmtDate(claim.claimDate)],
    ["Amount", omr(num(claim.amount))],
    ["Tax", taxLabel],
    ["Paid from", claim.fundedByCredit ? "Credit balance" : "Reimbursement"],
    ["Submitted", fmtDate(claim.createdAt)],
    ...(claim.decidedAt ? [["Decided", fmtDate(claim.decidedAt)] as [string, React.ReactNode]] : []),
  ];

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader back={{ href: "/portal/claims", label: "Claims" }} eyebrow={isProject ? "Project claim" : "General claim"} title={claim.title} />

      {saved && (
        <p className="mb-5 flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
          <Icon name="check" className="h-5 w-5" strokeWidth={2.4} /> Changes saved.
        </p>
      )}

      {submitted && (
        <p className="mb-5 flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
          <Icon name="check" className="h-5 w-5" strokeWidth={2.4} /> Claim submitted. An admin will review it soon.
        </p>
      )}

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 bg-ink p-6 text-white">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-white/60">Total incl. tax</p>
            <p className="font-display text-3xl font-extrabold">{omr(total)}</p>
          </div>
          <StatusPill status={claim.status} />
        </div>
        <dl className="grid gap-x-6 sm:grid-cols-2">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 border-b border-line px-6 py-3.5 sm:block">
              <dt className="text-sm text-muted">{k}</dt>
              <dd className="text-right font-semibold sm:mt-0.5 sm:text-left">{v}</dd>
            </div>
          ))}
        </dl>
        {claim.description && (
          <div className="border-b border-line px-6 py-4">
            <p className="text-sm text-muted">Description</p>
            <p className="mt-1 whitespace-pre-line">{claim.description}</p>
          </div>
        )}
        <div className="px-6 py-5">
          <p className="mb-3 text-sm font-bold">Documents</p>
          <Attachments kind="claim" id={id} count={claim.attachmentCount} names={claim.attachmentNames} />
        </div>
      </div>

      {pending && (me.isAdmin || claim.userId === me.id) && (
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          {claim.userId === me.id && (
            <Link href={`/portal/claims/${id}/edit`} className="btn-ghost flex-1 sm:flex-none">Edit claim</Link>
          )}
          <ClaimActions
            id={id}
            title={claim.title}
            amount={omr(total)}
            target={isProject ? `an expense on ${claim.projectName}` : "a general expense"}
            canDecide={me.isAdmin}
            canDelete
            afterDelete="/portal/claims"
          />
        </div>
      )}
    </div>
  );
}
