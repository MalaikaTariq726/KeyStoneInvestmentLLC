import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getClaim, listClaimsForCredit, listProjectNames } from "@/lib/data";
import { num } from "@/lib/decimal";
import { fileList, storedToDateInput, taxModeOf } from "@/lib/expenseForm";
import { creditSummary, totalAmount } from "@/lib/models";
import { PageHeader } from "@/components/ui";
import { EntryForm } from "@/components/EntryForm";

export const metadata = { title: "Edit claim" };

export default async function EditClaimPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const { id } = await params;
  const [claim, projects, creditClaims] = await Promise.all([getClaim(id), listProjectNames(), listClaimsForCredit()]);
  // Same rule as the desktop app: only the person who raised it, only while pending.
  if (!claim || claim.userId !== me.id) notFound();
  const back = `/portal/claims/${id}`;

  if ((claim.status ?? "").toLowerCase() !== "pending") {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader back={{ href: back, label: claim.title }} title="This claim can't be edited" subtitle={`It has already been ${claim.status.toLowerCase()}. Only pending claims can be changed.`} />
      </div>
    );
  }

  // This claim's own amount is already reserved against the balance - add it back.
  let available = creditSummary(me.doc, creditClaims).available;
  if (claim.fundedByCredit) available += totalAmount(claim);
  const isProject = (claim.claimType ?? "").toLowerCase() === "project" && claim.projectId;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader back={{ href: back, label: claim.title }} eyebrow="Edit claim" title={claim.title} subtitle="You can change a claim until an admin approves or rejects it." />
      <EntryForm
        mode="claim"
        projects={projects}
        currentUserId={me.id}
        myAvailableCredit={available}
        successHref={back}
        edit={{
          claimId: id,
          initial: {
            applyTo: isProject ? String(claim.projectId) : "General",
            expenseType: claim.expenseType?.trim() || "User Claim",
            title: claim.title,
            amount: String(num(claim.amount)),
            date: storedToDateInput(claim.claimDate),
            description: claim.description ?? "",
            taxMode: taxModeOf(claim.includesVat, claim.taxPercent),
            taxPercent: String(num(claim.taxPercent) || 5),
            fundedByCredit: !!claim.fundedByCredit,
          },
          files: fileList(claim.attachmentCount, claim.attachmentNames, (i) => `/api/files?kind=claim&id=${id}&i=${i}`),
        }}
      />
    </div>
  );
}
