import Link from "next/link";
import { requireUser, type CurrentUser } from "@/lib/auth";
import { listClaims, listClaimsForCredit } from "@/lib/data";
import { fmtDate, omr } from "@/lib/format";
import { creditSummary, totalAmount } from "@/lib/models";
import { AdminDashboard, type DashboardSearch } from "./AdminDashboard";
import { EmptyState, PageHeader, StatCard, StatusPill } from "@/components/ui";
import { Icon } from "@/components/Icon";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<DashboardSearch> }) {
  const me = await requireUser();
  return me.isAdmin ? <AdminDashboard me={me} search={await searchParams} greeting={greeting()} /> : <UserDashboard me={me} />;
}

function greeting() {
  const hour = Number(new Date().toLocaleString("en-GB", { hour: "numeric", hour12: false, timeZone: "Asia/Muscat" }));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

async function UserDashboard({ me }: { me: CurrentUser }) {
  const [claims, creditClaims] = await Promise.all([listClaims({ userId: me.id }), listClaimsForCredit()]);
  const credit = creditSummary(me.doc, creditClaims);
  const pending = claims.filter((c) => c.status.toLowerCase() === "pending");
  const approved = claims.filter((c) => c.status.toLowerCase() === "approved");
  const sum = (list: typeof claims) => list.reduce((s, c) => s + totalAmount(c), 0);

  return (
    <>
      <PageHeader eyebrow={greeting()} title={me.fullName.split(" ")[0]} subtitle="Here's where your claims and credit stand." />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <div className="col-span-2">
          <StatCard tone="navy" icon="wallet" label="Credit available" value={omr(credit.available)} hint={`${omr(credit.outstanding)} outstanding · ${omr(credit.granted)} granted in total`} />
        </div>
        <StatCard icon="clock" label="Pending" value={String(pending.length)} hint={omr(sum(pending))} />
        <StatCard icon="check" label="Approved" value={String(approved.length)} hint={omr(sum(approved))} />
      </div>

      <Link href="/portal/claims/new" className="card group mt-5 flex items-center gap-4 p-5 transition hover:shadow-lift">
        <span className="grid h-12 w-12 place-items-center rounded-2xl text-white shadow-glow" style={{ background: "linear-gradient(120deg,#f15a24,#ff7b47)" }}>
          <Icon name="plus" className="h-6 w-6" strokeWidth={2.4} />
        </span>
        <span className="flex-1">
          <span className="block font-display text-lg font-bold">Submit a new claim</span>
          <span className="block text-sm text-muted">Snap a receipt and send it for approval in under a minute.</span>
        </span>
        <Icon name="arrow" className="h-5 w-5 text-muted transition group-hover:translate-x-1 group-hover:text-accent" />
      </Link>

      <section className="mt-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold">Recent claims</h2>
          <Link href="/portal/claims" className="text-sm font-bold text-accent">View all</Link>
        </div>
        {claims.length === 0 ? (
          <EmptyState icon="claims" title="No claims yet" text="Claims you submit will appear here with their approval status." />
        ) : (
          <ul className="card divide-y divide-line">
            {claims.slice(0, 5).map((c) => (
              <li key={c._id.toHexString()}>
                <Link href={`/portal/claims/${c._id.toHexString()}`} className="flex items-center gap-4 px-5 py-4 hover:bg-soft/60">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{c.title}</p>
                    <p className="truncate text-sm text-muted">{c.projectName || "General"} · {fmtDate(c.claimDate)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">{omr(totalAmount(c))}</p>
                    <StatusPill status={c.status} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
