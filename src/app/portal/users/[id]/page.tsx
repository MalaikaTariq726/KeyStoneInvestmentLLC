import Link from "next/link";
import { notFound } from "next/navigation";
import { ObjectId } from "mongodb";
import { requireAdmin } from "@/lib/auth";
import { C, getDb } from "@/lib/db";
import { listClaims, listClaimsForCredit } from "@/lib/data";
import { num } from "@/lib/decimal";
import { env } from "@/lib/env";
import { fmtDate, omr } from "@/lib/format";
import { creditSummary, roleOf, totalAmount, type UserDoc } from "@/lib/models";
import { EmptyState, PageHeader, StatCard, StatusPill } from "@/components/ui";
import { DeleteUserButton, GrantCreditForm } from "@/components/users/CreditAndDelete";

export const metadata = { title: "User" };

export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireAdmin();
  const { id } = await params;
  if (!ObjectId.isValid(id)) notFound();
  const db = await getDb();
  const user = await db.collection<UserDoc>(C.users).findOne({ _id: new ObjectId(id) }, { projection: { passwordHash: 0 } });
  if (!user) notFound();
  const [claims, creditClaims] = await Promise.all([listClaims({ userId: id }), listClaimsForCredit()]);
  const credit = creditSummary(user, creditClaims);
  const grants = [...(user.creditGrants ?? [])].sort((a, b) => new Date(b.grantedAt).getTime() - new Date(a.grantedAt).getTime());
  const email = (user.email ?? "").trim().toLowerCase();

  return (
    <>
      <PageHeader
        back={{ href: "/portal/users", label: "Users" }}
        eyebrow={roleOf(user.role)}
        title={user.fullName || email}
        subtitle={`${email}${user.employeeName ? ` · linked to ${user.employeeName}` : ""}${email.endsWith(`@${env.allowedDomain}`) ? "" : " · desktop only"}`}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard tone="navy" icon="wallet" label="Credit available" value={omr(credit.available)} hint="Outstanding minus pending claims" />
        <StatCard icon="trend" label="Granted" value={omr(credit.granted)} hint={`${grants.length} grant${grants.length === 1 ? "" : "s"}`} />
        <StatCard icon="check" label="Used" value={omr(credit.used)} hint="Approved credit claims" />
        <StatCard tone="orange" icon="clock" label="Outstanding" value={omr(credit.outstanding)} hint={credit.pending ? `${omr(credit.pending)} in pending claims` : "Not yet claimed"} />
      </div>

      <div className="mt-6">
        <GrantCreditForm userId={id} name={user.fullName || email} outstanding={credit.outstanding} />
      </div>

      <section className="mt-8">
        <h2 className="mb-4 font-display text-xl font-bold">Credit history</h2>
        {grants.length === 0 ? (
          <EmptyState icon="wallet" title="No credit granted yet" text="Advances given to this person appear here." />
        ) : (
          <ul className="card divide-y divide-line">
            {grants.map((g, i) => (
              <li key={i} className="flex items-center gap-4 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{omr(num(g.amount))}</p>
                  <p className="truncate text-sm text-muted">{g.note || "No note"} · {fmtDate(g.grantedAt)}{g.grantedBy ? ` · by ${g.grantedBy}` : ""}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-4 font-display text-xl font-bold">Claims</h2>
        {claims.length === 0 ? (
          <EmptyState icon="claims" title="No claims" text="Claims raised by this person appear here." />
        ) : (
          <ul className="card divide-y divide-line">
            {claims.map((c) => (
              <li key={c._id.toHexString()}>
                <Link href={`/portal/claims/${c._id.toHexString()}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-soft/60">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{c.title}</span>
                    <span className="block truncate text-sm text-muted">{c.projectName || "General"} · {fmtDate(c.claimDate)}{c.fundedByCredit ? " · credit" : ""}</span>
                  </span>
                  <span className="text-right">
                    <span className="block font-bold">{omr(totalAmount(c))}</span>
                    <StatusPill status={c.status} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {id !== me.id && (
        <section className="mt-12 rounded-3xl border border-red-200 bg-red-50/40 p-5">
          <h2 className="font-display text-lg font-bold text-red-800">Danger zone</h2>
          <p className="mb-4 mt-1 text-sm text-red-900/70">Deleting stops this person signing in anywhere. To keep the account but limit access, change their role instead.</p>
          <DeleteUserButton userId={id} email={email} name={user.fullName || email} />
        </section>
      )}
    </>
  );
}
