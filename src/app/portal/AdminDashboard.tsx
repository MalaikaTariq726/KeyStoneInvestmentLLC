import Link from "next/link";
import type { CurrentUser } from "@/lib/auth";
import { listClaims, listGeneralExpenses, listProjects } from "@/lib/data";
import { num } from "@/lib/decimal";
import { listEmployeesFull } from "@/lib/employees";
import { omr } from "@/lib/format";
import {
  buildLedgerEntries,
  buildProjectLedgerEntries,
  expenseTaxPortion,
  inRange,
  MONTHS,
  omanParts,
  periodBuckets,
  projectFinanceSummary,
  projectPercent,
  recentYears,
  type Period,
} from "@/lib/ledger";
import { totalAmount, VAT_RATE } from "@/lib/models";
import { contractBase, effectivePercentage, projectDate, stageInflows } from "@/lib/projects";
import { ensureSalaryRecords, isDisabled, isPaid, projectSalaryCharges } from "@/lib/salary";
import { agreementPaid } from "@/lib/subcontractors";
import { clauseSettled } from "@/lib/models";
import { StatCard, StatusPill } from "@/components/ui";
import { AutoForm } from "@/components/AutoForm";
import { Icon } from "@/components/Icon";

export type DashboardSearch = { project?: string; period?: string; y?: string; m?: string };

const PERIODS: Array<{ value: Period; label: string }> = [
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "year", label: "This year" },
  { value: "smonth", label: "Specific month" },
  { value: "syear", label: "Specific year" },
];

const sum = <T,>(list: T[], f: (x: T) => number) => list.reduce((s, x) => s + f(x), 0);
const isStatus = (s: string | undefined, v: string) => (s ?? "").toLowerCase() === v;

// The desktop app's Dashboard: one project or all of them, for a chosen period.
export async function AdminDashboard({ me, search, greeting }: { me: CurrentUser; search: DashboardSearch; greeting: string }) {
  const [projects, general, employees, pendingClaims] = await Promise.all([
    listProjects(),
    listGeneralExpenses(),
    listEmployeesFull(),
    listClaims({ status: { $regex: "^pending$", $options: "i" } }),
  ]);

  const now = omanParts(new Date());
  const period: Period = PERIODS.some((p) => p.value === search.period) ? (search.period as Period) : "month";
  const year = Number(search.y) || now.y;
  const month = Number(search.m) || now.m + 1;
  const selected = projects.find((p) => p._id.toHexString() === search.project) ?? null;
  const selectedId = selected?._id.toHexString() ?? "";

  const scopedProjects = selected ? [selected] : projects;
  const scopedGeneral = selected ? [] : general;
  const scopedEmployees = selected ? employees.filter((e) => projectPercent(e, selectedId) > 0) : employees;

  const ledger = selected ? buildProjectLedgerEntries(selected, employees) : buildLedgerEntries(projects, general, employees);

  const buckets = periodBuckets(period, year, month);
  const start = buckets[0].start;
  const end = buckets[buckets.length - 1].end;
  const inPeriod = ledger.filter((e) => inRange(e.date, start, end));

  // Period tiles (RefreshPeriodScopedTiles).
  const periodIn = sum(inPeriod.filter((e) => e.inflow), (e) => e.amount);
  const periodOut = sum(inPeriod.filter((e) => !e.inflow), (e) => e.amount);
  const periodProjectExp = sum(inPeriod.filter((e) => e.type === "Project Expense"), (e) => e.amount);
  const periodGeneralExp = sum(scopedGeneral.filter((e) => inRange(new Date(e.transactionDate), start, end)), (e) => totalAmount(e));
  const periodSalaryPaid = sum(inPeriod.filter((e) => e.type === "Employee Salary"), (e) => e.amount);
  const periodNet = periodIn - periodOut;

  const periodProjects = scopedProjects.filter((p) => selected || inRange(projectDate(p), start, end));
  const periodEmployees = scopedEmployees.filter((e) => selected || inRange(new Date(e.joiningDate), start, end));

  // Running balances that aren't period-scoped.
  const salaryRecords = employees.map((e) => ({ e, records: ensureSalaryRecords(e).records }));
  const salaryPaidAll = selected
    ? sum(projectSalaryCharges(employees, selectedId), (c) => c.amount)
    : sum(salaryRecords.flatMap((x) => x.records.filter(isPaid)), (r) => num(r.amount));
  const salaryPending = selected
    ? sum(salaryRecords.filter((x) => projectPercent(x.e, selectedId) > 0), (x) => (sum(x.records.filter((r) => !isPaid(r)), (r) => num(r.amount)) * projectPercent(x.e, selectedId)) / 100)
    : sum(salaryRecords.flatMap((x) => x.records.filter((r) => !isPaid(r))), (r) => num(r.amount));
  const projectExpensesAll = sum(scopedProjects, (p) => sum(p.expenses, (e) => totalAmount(e)));
  const generalAll = sum(scopedGeneral, (e) => totalAmount(e));

  // Tax and per-project breakdown (RefreshTaxAndProjectBreakdown).
  const summaries = scopedProjects.map((p) => projectFinanceSummary(p, employees, start, end));
  const generalTaxPaid = sum(scopedGeneral.filter((e) => inRange(new Date(e.transactionDate), start, end)), expenseTaxPortion);
  const taxCollected = sum(summaries, (s) => s.taxCollected);
  const taxPaid = sum(summaries, (s) => s.taxPaid) + generalTaxPaid;
  const netTax = taxCollected - taxPaid;
  const breakdown = summaries
    .filter((s) => s.hasActivity || inRange(projectDate(s.project), start, end))
    .sort((a, b) => b.received - a.received || a.project.name.localeCompare(b.project.name));

  // Waterfall (RefreshWaterfallChart).
  const opening = sum(ledger.filter((e) => e.date.getTime() < start.getTime()), (e) => (e.inflow ? e.amount : -e.amount));
  const income = periodIn;
  const salary = periodSalaryPaid;
  const expenses = sum(inPeriod.filter((e) => e.type === "Project Expense" || e.type === "General Expense"), (e) => e.amount);
  const final = opening + income - salary - expenses;

  // In/out per bucket for the trend bars.
  const trend = buckets.map((b) => {
    const list = inPeriod.filter((e) => inRange(e.date, b.start, b.end));
    return { label: b.label, in: sum(list.filter((e) => e.inflow), (e) => e.amount), out: sum(list.filter((e) => !e.inflow), (e) => e.amount) };
  });

  const periodLabel =
    period === "smonth" ? `${MONTHS[month - 1]} ${year}` : period === "syear" ? String(year) : PERIODS.find((p) => p.value === period)!.label;
  const scopeLabel = selected ? selected.name : "All projects";

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="eyebrow mb-2">{greeting}, {me.fullName.split(" ")[0]}</p>
          <h1 className="font-display text-[1.75rem] font-extrabold leading-tight tracking-tight sm:text-4xl">Dashboard</h1>
          <p className="mt-2 text-muted">{scopeLabel} · {periodLabel}</p>
        </div>
        <AutoForm className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end">
          <label className="col-span-2 sm:w-56">
            <span className="label">Project</span>
            <select name="project" defaultValue={selectedId} className="field">
              <option value="">All projects</option>
              {[...projects].sort((a, b) => a.name.localeCompare(b.name)).map((p) => (
                <option key={p._id.toHexString()} value={p._id.toHexString()}>{p.name}</option>
              ))}
            </select>
          </label>
          <label className={period === "smonth" || period === "syear" ? "" : "col-span-2"}>
            <span className="label">Period</span>
            <select name="period" defaultValue={period} className="field sm:w-44">
              {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </label>
          {period === "smonth" && (
            <label>
              <span className="label">Month</span>
              <select name="m" defaultValue={month} className="field sm:w-36">
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </label>
          )}
          {(period === "smonth" || period === "syear") && (
            <label className={period === "smonth" ? "col-span-2 sm:col-span-1" : ""}>
              <span className="label">Year</span>
              <select name="y" defaultValue={year} className="field sm:w-28">
                {recentYears().map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
          )}
          <noscript><button className="btn-dark px-5">Apply</button></noscript>
        </AutoForm>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard tone="navy" icon="projects" label={selected ? "Project" : "Projects"} value={String(periodProjects.length)} hint={`${periodProjects.filter((p) => !isStatus(p.status, "closed")).length} active`} />
        <StatCard icon="trend" label="Contract value" value={omr(sum(periodProjects, (p) => num(p.contractValue)))} hint={`${omr(periodIn)} received`} />
        <StatCard icon="person" label="Employees" value={String(periodEmployees.length)} hint={`${periodEmployees.filter((e) => !isDisabled(e)).length} permanent / ${periodEmployees.filter(isDisabled).length} disabled`} />
        <div className={`${periodNet >= 0 ? "card" : "card ring-1 ring-red-200"} relative overflow-hidden p-5 sm:p-6`}>
          <div className="mb-4 grid h-10 w-10 place-items-center rounded-xl bg-accent/10 text-accent"><Icon name="wallet" /></div>
          <p className="text-xs font-bold uppercase tracking-widest text-muted">Net cash</p>
          <p className={`mt-1.5 font-display text-2xl font-extrabold tracking-tight xl:text-[1.7rem] ${periodNet >= 0 ? "text-emerald-700" : "text-red-700"}`}>{omr(periodNet)}</p>
          <p className="mt-1 text-xs font-semibold text-muted">{omr(periodIn)} in / {omr(periodOut)} out</p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:mt-4 sm:grid-cols-3 sm:gap-4">
        <MiniStat label="Expenses" value={omr(periodProjectExp + periodGeneralExp)} />
        <MiniStat label="Salary paid" value={omr(periodSalaryPaid)} />
        <MiniStat label="Salary pending" value={omr(salaryPending)} hint="All unpaid months" />
        <MiniStat label="Stages" value={String(sum(periodProjects, (p) => (p.clauses ?? []).length))} />
        <MiniStat label="Pending projects" value={String(periodProjects.filter((p) => isStatus(p.status, "pending")).length)} />
        <MiniStat label="Closed projects" value={String(periodProjects.filter((p) => isStatus(p.status, "closed")).length)} />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:mt-4 sm:grid-cols-3 sm:gap-4">
        <MiniStat label="Tax collected" value={omr(taxCollected)} hint="VAT in client payments" />
        <MiniStat label="Tax paid" value={omr(taxPaid)} hint="VAT in expenses" />
        <MiniStat
          label="Net tax due"
          value={netTax >= 0 ? omr(netTax) : `${omr(-netTax)} refundable`}
          valueClass={netTax > 0 ? "text-orange-700" : "text-emerald-700"}
          hint="Collected minus paid"
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-5">
        <section className="card p-5 sm:p-6 lg:col-span-3">
          <h2 className="font-display text-xl font-bold">Cash position</h2>
          <p className="mb-5 text-sm text-muted">Opening balance, what came in and went out, and where it ended · {periodLabel}</p>
          <Waterfall opening={opening} income={income} salary={salary} expenses={expenses} final={final} />
        </section>
        <section className="card p-5 sm:p-6 lg:col-span-2">
          <h2 className="font-display text-xl font-bold">Where money goes</h2>
          <p className="mb-5 text-sm text-muted">All time{selected ? `, ${selected.name}` : ""}</p>
          <Donut
            slices={[
              { label: "Project expenses", value: projectExpensesAll, color: "#b02222" },
              { label: "General expenses", value: generalAll, color: "#2862dd" },
              { label: "Salary paid", value: salaryPaidAll, color: "#c9971c" },
              { label: "Salary pending", value: salaryPending, color: "#ef5a39" },
            ]}
          />
        </section>
      </div>

      <section className="card mt-5 p-5 sm:p-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-bold">Cash flow</h2>
            <p className="text-sm text-muted">{periodLabel}</p>
          </div>
          <div className="flex gap-4 text-xs font-bold">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-primary" /> In</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-accent" /> Out</span>
          </div>
        </div>
        <TrendBars trend={trend} />
      </section>

      {selected && <ProjectSummary project={selected} employees={employees} />}

      <section className="card mt-5 overflow-hidden">
        <div className="p-5 pb-3 sm:p-6 sm:pb-3">
          <h2 className="font-display text-xl font-bold">Project breakdown</h2>
          <p className="text-sm text-muted">Money moved on each project · {periodLabel}. Received and expenses include tax.</p>
        </div>
        {breakdown.length === 0 ? (
          <p className="px-6 pb-6 text-muted">No project activity in this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-soft/70 text-right text-xs font-bold uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-5 py-3 text-left">Project</th>
                  <th className="px-3 py-3">Contract</th>
                  <th className="px-3 py-3">Received</th>
                  <th className="px-3 py-3">Tax coll.</th>
                  <th className="px-3 py-3">Expenses</th>
                  <th className="px-3 py-3">Salaries</th>
                  <th className="px-3 py-3">Tax paid</th>
                  <th className="px-5 py-3">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line text-right">
                {breakdown.map((s) => (
                  <tr key={s.project._id.toHexString()} className="hover:bg-soft/40">
                    <td className="max-w-[14rem] truncate px-5 py-3 text-left font-semibold"><Link href={`/portal/projects/${s.project._id.toHexString()}`} className="hover:text-accent">{s.project.name}</Link></td>
                    <td className="px-3 py-3">{omr(num(s.project.contractValue))}</td>
                    <td className="px-3 py-3">{omr(s.received)}</td>
                    <td className="px-3 py-3">{omr(s.taxCollected)}</td>
                    <td className="px-3 py-3">{omr(s.expenses)}</td>
                    <td className="px-3 py-3">{omr(s.salaries)}</td>
                    <td className="px-3 py-3">{omr(s.taxPaid)}</td>
                    <td className={`px-5 py-3 font-bold ${s.net >= 0 ? "text-emerald-700" : "text-red-700"}`}>{omr(s.net)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-line bg-soft/50 text-right font-bold">
                <tr>
                  <td className="px-5 py-3 text-left">Total</td>
                  <td className="px-3 py-3">{omr(sum(breakdown, (s) => num(s.project.contractValue)))}</td>
                  <td className="px-3 py-3">{omr(sum(breakdown, (s) => s.received))}</td>
                  <td className="px-3 py-3">{omr(sum(breakdown, (s) => s.taxCollected))}</td>
                  <td className="px-3 py-3">{omr(sum(breakdown, (s) => s.expenses))}</td>
                  <td className="px-3 py-3">{omr(sum(breakdown, (s) => s.salaries))}</td>
                  <td className="px-3 py-3">{omr(sum(breakdown, (s) => s.taxPaid))}</td>
                  <td className={`px-5 py-3 ${sum(breakdown, (s) => s.net) >= 0 ? "text-emerald-700" : "text-red-700"}`}>{omr(sum(breakdown, (s) => s.net))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      <section className="card mt-5 p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold">Waiting for approval</h2>
          <Link href="/portal/claims" className="text-sm font-bold text-accent">All claims</Link>
        </div>
        {pendingClaims.length === 0 ? (
          <p className="flex items-center gap-2 text-muted"><Icon name="check" className="h-5 w-5 text-emerald-600" /> All caught up. No claims are waiting.</p>
        ) : (
          <ul className="-mx-2 grid gap-1 sm:grid-cols-2">
            {pendingClaims.slice(0, 8).map((c) => (
              <li key={c._id.toHexString()}>
                <Link href={`/portal/claims/${c._id.toHexString()}`} className="flex items-center gap-3 rounded-xl px-2 py-3 hover:bg-soft">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-soft font-display text-xs font-bold">
                    {c.userName.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{c.title}</span>
                    <span className="block truncate text-xs text-muted">{c.userName} · {c.projectName || "General"}</span>
                  </span>
                  <span className="text-sm font-bold">{omr(totalAmount(c))}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function MiniStat({ label, value, hint, valueClass = "" }: { label: string; value: string; hint?: string; valueClass?: string }) {
  return (
    <div className="card px-4 py-3.5 sm:px-5">
      <p className="text-[11px] font-bold uppercase tracking-widest text-muted">{label}</p>
      <p className={`mt-1 truncate font-display text-lg font-extrabold tracking-tight ${valueClass}`} title={value}>{value}</p>
      {hint && <p className="truncate text-xs text-muted">{hint}</p>}
    </div>
  );
}

function Waterfall({ opening, income, salary, expenses, final }: { opening: number; income: number; salary: number; expenses: number; final: number }) {
  const afterIncome = opening + income;
  const afterSalary = afterIncome - salary;
  const bars = [
    { label: "Opening", from: 0, to: opening, color: "#64748b", text: omr(opening) },
    { label: "+ Income", from: opening, to: afterIncome, color: "#1f7a4d", text: `+${omr(income)}` },
    { label: "− Salary", from: afterIncome, to: afterSalary, color: "#b02222", text: `−${omr(salary)}` },
    { label: "− Expenses", from: afterSalary, to: final, color: "#b02222", text: `−${omr(expenses)}` },
    { label: "Final", from: 0, to: final, color: final >= 0 ? "#14213d" : "#b02222", text: omr(final) },
  ];
  const lo = Math.min(0, ...bars.flatMap((b) => [b.from, b.to]));
  const hi = Math.max(0, ...bars.flatMap((b) => [b.from, b.to]));
  const span = hi - lo || 1;
  const y = (v: number) => ((v - lo) / span) * 100;
  return (
    <div>
      <div className="relative h-56 border-b border-line" style={{ marginTop: "2.75rem" }}>
        {lo < 0 && <div className="absolute inset-x-0 border-t border-dashed border-slate-300" style={{ bottom: `${y(0)}%` }} />}
        <div className="absolute inset-0 flex gap-2 sm:gap-4">
          {bars.map((b) => {
            const bottom = y(Math.min(b.from, b.to));
            const height = Math.max(0.8, Math.abs(y(b.to) - y(b.from)));
            return (
              <div key={b.label} className="relative flex-1">
                <div className="absolute inset-x-[12%] rounded-md" style={{ bottom: `${bottom}%`, height: `${height}%`, background: b.color }} title={`${b.label}: ${b.text}`} />
                <p className="absolute inset-x-0 text-center text-[10px] font-bold leading-tight sm:text-xs" style={{ bottom: `calc(${bottom + height}% + 4px)` }}>{b.text}</p>
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-2 flex gap-2 sm:gap-4">
        {bars.map((b) => <p key={b.label} className="flex-1 text-center text-[11px] font-bold text-muted sm:text-xs">{b.label}</p>)}
      </div>
    </div>
  );
}

function Donut({ slices }: { slices: Array<{ label: string; value: number; color: string }> }) {
  const total = sum(slices, (s) => Math.max(0, s.value));
  const r = 42;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row lg:flex-col xl:flex-row">
      <svg viewBox="0 0 120 120" className="h-40 w-40 shrink-0 -rotate-90" role="img" aria-label="Spending split">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#eef1f6" strokeWidth="18" />
        {total > 0 &&
          slices.map((s) => {
            const len = (Math.max(0, s.value) / total) * c;
            const el = <circle key={s.label} cx="60" cy="60" r={r} fill="none" stroke={s.color} strokeWidth="18" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} />;
            offset += len;
            return el;
          })}
      </svg>
      <ul className="w-full space-y-2.5 text-sm">
        {slices.map((s) => (
          <li key={s.label} className="flex items-center gap-2.5">
            <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: s.color }} />
            <span className="flex-1 text-muted">{s.label}</span>
            <span className="font-bold">{omr(s.value)}</span>
            <span className="w-10 text-right text-xs text-muted">{total > 0 ? Math.round((Math.max(0, s.value) / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TrendBars({ trend }: { trend: Array<{ label: string; in: number; out: number }> }) {
  const max = Math.max(1, ...trend.flatMap((t) => [t.in, t.out]));
  const every = trend.length > 20 ? 5 : 1;
  return (
    <div className="flex h-48 items-end gap-[2px] sm:gap-1">
      {trend.map((t, i) => (
        <div key={i} className="flex h-full min-w-0 flex-1 flex-col justify-end">
          <div className="flex flex-1 items-end justify-center gap-[1px]">
            <div className="w-1/2 max-w-5 rounded-t bg-primary" style={{ height: `${(t.in / max) * 100}%`, minHeight: t.in ? 3 : 0 }} title={`${t.label} in ${omr(t.in)}`} />
            <div className="w-1/2 max-w-5 rounded-t bg-accent" style={{ height: `${(t.out / max) * 100}%`, minHeight: t.out ? 3 : 0 }} title={`${t.label} out ${omr(t.out)}`} />
          </div>
          <p className="mt-2 h-4 text-center text-[10px] font-bold text-muted sm:text-xs">{i % every === 0 || i === trend.length - 1 ? t.label : ""}</p>
        </div>
      ))}
    </div>
  );
}

type ProjectT = Awaited<ReturnType<typeof listProjects>>[number];
type EmployeeT = Awaited<ReturnType<typeof listEmployeesFull>>[number];

// RefreshDashboardProjectSummary: the chosen project's whole-life position.
function ProjectSummary({ project, employees }: { project: ProjectT; employees: EmployeeT[] }) {
  const id = project._id.toHexString();
  const value = num(project.contractValue);
  const collected = sum(stageInflows(project), (f) => f.amount);
  const spent = sum(project.expenses, (e) => totalAmount(e));
  const salaries = sum(projectSalaryCharges(employees, id), (c) => c.amount);
  const agreements = project.subcontractorAgreements ?? [];
  const base = contractBase(value);
  const team = employees
    .map((e) => ({ e, percent: projectPercent(e, id) }))
    .filter((x) => x.percent > 0)
    .sort((a, b) => b.percent - a.percent);
  const profit = collected - spent - salaries;

  const stats: Array<[string, number, boolean?]> = [
    ["Contract value", value],
    ["Collected from client", collected],
    ["Still to collect", Math.max(0, value - collected)],
    ["Profit so far", profit, true],
    ["Expenses (incl. claims)", spent],
    ["Salaries charged", salaries],
    ["Subcontractors committed", sum(agreements, (a) => num(a.agreementValue))],
    ["Subcontractors paid", sum(agreements, agreementPaid)],
  ];

  return (
    <section className="card mt-5 p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-xl font-bold">{project.name}</h2>
        <StatusPill status={project.status} />
        <Link href={`/portal/projects/${id}`} className="ml-auto text-sm font-bold text-accent">Open project</Link>
      </div>
      <p className="text-sm text-muted">{project.clientName || "—"} · whole project to date (not limited to the period). Amounts include tax.</p>

      <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 lg:grid-cols-4">
        {stats.map(([label, v, signed]) => (
          <div key={label}>
            <p className="text-xs text-muted">{label}</p>
            <p className={`font-display text-lg font-bold ${signed ? (v >= 0 ? "text-emerald-700" : "text-red-700") : ""}`}>{omr(v)}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 font-display font-bold">Stages</h3>
          {(project.clauses ?? []).length === 0 ? (
            <p className="text-sm text-muted">No stages set up yet.</p>
          ) : (
            <ul className="space-y-2">
              {(project.clauses ?? []).map((c, i) => {
                const pctVal = num(c.percentage) || effectivePercentage(num(c.paymentAmount), base);
                return (
                  <li key={i} className="flex items-center gap-3 rounded-xl bg-soft/60 px-3 py-2.5 text-sm">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold">{c.title}</span>
                      <span className="block truncate text-xs text-muted">{Number(pctVal.toFixed(2))}% · {omr(num(c.paymentAmount) * (1 + VAT_RATE))} incl. tax · {omr(clauseSettled(c) * (1 + VAT_RATE))} collected</span>
                    </span>
                    <StatusPill status={c.status} />
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div>
          <h3 className="mb-2 font-display font-bold">Team on this project</h3>
          {team.length === 0 ? (
            <p className="text-sm text-muted">Nobody assigned. Add this project to an employee&apos;s salary split under Employees → Edit.</p>
          ) : (
            <ul className="space-y-2">
              {team.map(({ e, percent }) => (
                <li key={e._id.toHexString()}>
                  <Link href={`/portal/employees/${e._id.toHexString()}`} className="flex items-center gap-3 rounded-xl bg-soft/60 px-3 py-2.5 text-sm hover:bg-soft">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold">{e.name}</span>
                      <span className="block truncate text-xs text-muted">{e.designation || "—"} · {Number(percent.toFixed(2))}% of salary</span>
                    </span>
                    <span className="font-bold">{omr((num(e.monthlySalary) * percent) / 100)}<span className="text-xs font-normal text-muted"> / mo</span></span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
