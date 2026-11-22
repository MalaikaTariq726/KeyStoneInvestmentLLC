import { requireUser } from "@/lib/auth";
import { listClaimsForCredit, listProjectNames, listUsers } from "@/lib/data";
import { creditSummary } from "@/lib/models";
import { PageHeader } from "@/components/ui";
import { EntryForm } from "@/components/EntryForm";

export const metadata = { title: "New claim" };

export default async function NewClaimPage() {
  const me = await requireUser();
  const [projects, creditClaims] = await Promise.all([listProjectNames(), listClaimsForCredit()]);

  let users: Array<{ id: string; name: string; available: number }> | undefined;
  if (me.isAdmin) {
    const all = await listUsers();
    users = all.map((u) => ({ id: u._id.toHexString(), name: u.fullName || u.email, available: creditSummary(u, creditClaims).available }));
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader back={{ href: "/portal/claims", label: "Claims" }} eyebrow="New claim" title="Submit a claim" subtitle="It goes to an admin for approval. Approved claims are posted as expenses automatically." />
      <EntryForm
        mode="claim"
        projects={projects}
        users={users}
        currentUserId={me.id}
        myAvailableCredit={creditSummary(me.doc, creditClaims).available}
        successHref="/portal/claims"
      />
    </div>
  );
}
