import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { listClaimsForCredit, listUsers } from "@/lib/data";
import { num } from "@/lib/decimal";
import { listEmployeesFull } from "@/lib/employees";
import { fmtDate, omr } from "@/lib/format";
import { creditSummary } from "@/lib/models";
import { allocationDisplay, isDisabled, salarySummary } from "@/lib/salary";
import { EmptyState, PageHeader } from "@/components/ui";
import { Icon } from "@/components/Icon";

export const metadata = { title: "Employees" };

const pill: Record<string, string> = {
  Paid: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Pending: "bg-amber-50 text-amber-700 ring-amber-200",
  Overdue: "bg-red-50 text-red-700 ring-red-200",
  Disabled: "bg-slate-100 text-slate-600 ring-slate-200",
};

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireAdmin();
  const { q = "" } = await searchParams;
  const [employees, users, creditClaims] = await Promise.all([listEmployeesFull(), listUsers(), listClaimsForCredit()]);

  const needle = q.trim().toLowerCase();
  const rows = employees
    .map((e) => ({ e, s: salarySummary(e), statusLabel: isDisabled(e) ? "Disabled" : "Permanent" }))
    .filter(({ e, statusLabel }) => !needle || [e.name, e.designation, statusLabel, e.phone].some((x) => (x ?? "").toLowerCase().includes(needle)));

  const active = employees.filter((e) => !isDisabled(e));
  const payroll = active.reduce((s, e) => s + num(e.monthlySalary), 0);
  const overdue = employees.reduce((s, e) => s + salarySummary(e).overdueMonths, 0);

  return (
    <>
      <PageHeader
        eyebrow="People"
        title="Employees"
        subtitle={`${active.length} active · monthly payroll ${omr(Math.round(payroll))}${overdue ? ` · ${overdue} overdue salary month${overdue === 1 ? "" : "s"}` : ""}`}
        action={<Link href="/portal/employees/new" className="btn-primary py-3"><Icon name="plus" className="h-5 w-5" strokeWidth={2.4} /> Add employee</Link>}
      />

      <form className="card mb-6 flex gap-2 p-4" role="search">
        <input name="q" defaultValue={q} className="field" placeholder="Search name, designation, status or phone" aria-label="Search employees" />
        <button className="btn-dark px-5">Search</button>
        {needle && <Link href="/portal/employees" className="btn-ghost">Clear</Link>}
      </form>

      {rows.length === 0 ? (
        <EmptyState
          icon="users"
          title={employees.length ? "No matches" : "No employees yet"}
          text={employees.length ? "No employees match this search." : "Add employees to track salaries and charge them to projects."}
          action={!employees.length ? <Link href="/portal/employees/new" className="btn-primary">Add employee</Link> : undefined}
        />
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {rows.map(({ e, s, statusLabel }) => {
            const id = e._id.toHexString();
            const linked = isDisabled(e) ? users.find((u) => u.employeeId === id) : undefined;
            const leftoverCredit = linked ? creditSummary(linked, creditClaims).outstanding : 0;
            return (
              <li key={id}>
                <Link href={`/portal/employees/${id}`} className="card flex h-full flex-col p-5 transition hover:-translate-y-0.5 hover:shadow-lift">
                  <div className="flex items-start gap-4">
                    <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl font-display font-bold ${isDisabled(e) ? "bg-slate-100 text-slate-500" : "bg-primary/10 text-primary"}`}>
                      {(e.name || "?").split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold">{e.name}</p>
                      <p className="truncate text-sm text-muted">{e.designation}{e.phone ? ` · ${e.phone}` : ""}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${pill[s.current]}`}>{s.current}</span>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-4 text-sm">
                    <div><p className="text-xs text-muted">Salary</p><p className="font-bold">{omr(Math.round(num(e.monthlySalary)))}</p></div>
                    <div><p className="text-xs text-muted">Joined</p><p className="font-bold">{fmtDate(e.joiningDate)}</p></div>
                    <div><p className="text-xs text-muted">Unpaid</p><p className={`font-bold ${s.overdueMonths ? "text-red-700" : ""}`}>{omr(Math.round(s.pending))}</p></div>
                  </div>
                  <p className="mt-3 truncate text-xs text-muted">{statusLabel} · {allocationDisplay(e)}</p>
                  {leftoverCredit > 0 && (
                    <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-800">Unclaimed credit at exit: {omr(Math.round(leftoverCredit))}</p>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
