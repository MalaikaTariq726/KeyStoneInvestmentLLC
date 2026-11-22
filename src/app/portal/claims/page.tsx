import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listClaims } from "@/lib/data";
import { fmtDate, omr } from "@/lib/format";
import { totalAmount } from "@/lib/models";
import { EmptyState, PageHeader, StatusPill, Tabs } from "@/components/ui";
import { ClaimActions } from "@/components/ClaimActions";
import { Icon } from "@/components/Icon";

export const metadata = { title: "Claims" };

const STATUSES = ["pending", "approved", "rejected"] as const;

export default async function ClaimsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const me = await requireUser();
  const { status: rawStatus } = await searchParams;
  const all = await listClaims(me.isAdmin ? {} : { userId: me.id });

  const defaultTab = me.isAdmin ? "pending" : "all";
  const tab = rawStatus && ["all", ...STATUSES].includes(rawStatus) ? rawStatus : defaultTab;
  const claims = tab === "all" ? all : all.filter((c) => c.status.toLowerCase() === tab);
  const count = (s: string) => all.filter((c) => c.status.toLowerCase() === s).length;

  const tabs = [
    ...(me.isAdmin ? [] : [{ key: "all", label: "All", href: "/portal/claims?status=all", count: all.length }]),
    { key: "pending", label: "Pending", href: "/portal/claims?status=pending", count: count("pending") },
    { key: "approved", label: "Approved", href: "/portal/claims?status=approved", count: count("approved") },
    { key: "rejected", label: "Rejected", href: "/portal/claims?status=rejected", count: count("rejected") },
    ...(me.isAdmin ? [{ key: "all", label: "All", href: "/portal/claims?status=all", count: all.length }] : []),
  ];

  return (
    <>
      <PageHeader
        eyebrow={me.isAdmin ? "Review" : "Your claims"}
        title={me.isAdmin ? "User claims" : "My claims"}
        subtitle={me.isAdmin ? "Approve or reject claims raised by your team." : "Track every claim you've submitted."}
        action={
          <Link href="/portal/claims/new" className="btn-primary hidden py-3 sm:inline-flex">
            <Icon name="plus" className="h-5 w-5" strokeWidth={2.4} /> New claim
          </Link>
        }
      />
      <Tabs items={tabs} active={tab} />

      {claims.length === 0 ? (
        <EmptyState icon="claims" title="Nothing here" text={tab === "pending" && me.isAdmin ? "No claims are waiting for approval." : "No claims match this filter yet."} />
      ) : (
        <ul className="space-y-3">
          {claims.map((c) => {
            const id = c._id.toHexString();
            const total = omr(totalAmount(c));
            const pending = c.status.toLowerCase() === "pending";
            const isProject = (c.claimType ?? "").toLowerCase() === "project";
            return (
              <li key={id} className="card overflow-hidden transition hover:shadow-lift">
                <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
                  <Link href={`/portal/claims/${id}`} className="flex min-w-0 flex-1 items-center gap-4">
                    <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${isProject ? "bg-primary/10 text-primary" : "bg-accent/10 text-accent"}`}>
                      <Icon name={isProject ? "projects" : "claims"} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold">{c.title}</span>
                      <span className="block truncate text-sm text-muted">
                        {me.isAdmin && <>{c.userName} · </>}
                        {c.projectName || "General"} · {fmtDate(c.claimDate)}
                      </span>
                      <span className="mt-1.5 flex flex-wrap items-center gap-2">
                        <StatusPill status={c.status} />
                        {c.fundedByCredit && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">Credit</span>}
                        {c.attachmentCount > 0 && (
                          <span className="flex items-center gap-1 text-xs font-semibold text-muted"><Icon name="clip" className="h-3.5 w-3.5" /> {c.attachmentCount}</span>
                        )}
                      </span>
                    </span>
                    <span className="text-right font-display text-lg font-bold">{total}</span>
                  </Link>
                  {me.isAdmin && pending && (
                    <div className="border-t border-line pt-3 sm:border-0 sm:pt-0">
                      <ClaimActions
                        id={id}
                        title={c.title}
                        amount={total}
                        target={isProject ? `an expense on ${c.projectName}` : "a general expense"}
                        canDecide
                        canDelete={false}
                        compact
                      />
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
