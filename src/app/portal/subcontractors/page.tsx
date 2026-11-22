import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { num } from "@/lib/decimal";
import { omr } from "@/lib/format";
import { agreementPaid, isActiveSub, listAgreements, listSubcontractors } from "@/lib/subcontractors";
import { EmptyState, PageHeader } from "@/components/ui";
import { Icon } from "@/components/Icon";

export const metadata = { title: "Subcontractors" };

export default async function SubcontractorsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireAdmin();
  const { q = "" } = await searchParams;
  const [subs, agreements] = await Promise.all([listSubcontractors(), listAgreements()]);
  const needle = q.trim().toLowerCase();
  const rows = subs.filter((s) => !needle || [s.name, s.tradeSpecialty, s.contactPerson, s.phone, s.status].some((x) => (x ?? "").toLowerCase().includes(needle)));
  const committed = agreements.reduce((s, a) => s + num(a.agreement.agreementValue), 0);
  const paid = agreements.reduce((s, a) => s + agreementPaid(a.agreement), 0);

  return (
    <>
      <PageHeader
        eyebrow="Partners"
        title="Subcontractors"
        subtitle={`${subs.filter(isActiveSub).length} active · ${omr(Math.round(committed))} committed · ${omr(Math.round(paid))} paid (excl. VAT)`}
        action={<Link href="/portal/subcontractors/new" className="btn-primary py-3"><Icon name="plus" className="h-5 w-5" strokeWidth={2.4} /> Add subcontractor</Link>}
      />
      <form className="card mb-6 flex gap-2 p-4" role="search">
        <input name="q" defaultValue={q} className="field" placeholder="Search name, trade, contact, phone or status" aria-label="Search subcontractors" />
        <button className="btn-dark px-5">Search</button>
        {needle && <Link href="/portal/subcontractors" className="btn-ghost">Clear</Link>}
      </form>

      {rows.length === 0 ? (
        <EmptyState
          icon="projects"
          title={subs.length ? "No matches" : "No subcontractors yet"}
          text={subs.length ? "No subcontractors match this search." : "Add the companies you subcontract work to, then give them agreements on projects."}
          action={!subs.length ? <Link href="/portal/subcontractors/new" className="btn-primary">Add subcontractor</Link> : undefined}
        />
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {rows.map((s) => {
            const id = s._id.toHexString();
            const mine = agreements.filter((a) => a.agreement.subcontractorId === id);
            const activeCount = mine.filter((a) => (a.agreement.status ?? "").toLowerCase() === "active").length;
            const value = mine.reduce((t, a) => t + num(a.agreement.agreementValue), 0);
            const paidHere = mine.reduce((t, a) => t + agreementPaid(a.agreement), 0);
            return (
              <li key={id}>
                <Link href={`/portal/subcontractors/${id}`} className="card flex h-full flex-col p-5 transition hover:-translate-y-0.5 hover:shadow-lift">
                  <div className="flex items-start gap-4">
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-accent/10 text-accent"><Icon name="projects" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold">{s.name}</p>
                      <p className="truncate text-sm text-muted">{s.tradeSpecialty}{s.contactPerson ? ` · ${s.contactPerson}` : ""}{s.phone ? ` · ${s.phone}` : ""}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${isActiveSub(s) ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-slate-100 text-slate-600 ring-slate-200"}`}>{s.status || "Active"}</span>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-4 text-sm">
                    <div><p className="text-xs text-muted">Active projects</p><p className="font-bold">{activeCount}</p></div>
                    <div><p className="text-xs text-muted">Committed</p><p className="font-bold">{omr(Math.round(value))}</p></div>
                    <div><p className="text-xs text-muted">Paid</p><p className="font-bold text-accent">{omr(Math.round(paidHere))}</p></div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
