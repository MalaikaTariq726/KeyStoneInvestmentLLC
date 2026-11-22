import "server-only";
import type { GeneralExpenseLite, ProjectLite } from "./data";
import { num } from "./decimal";
import { totalAmount, VAT_RATE } from "./models";
import { clauseSettled } from "./models";
import { expenseDate, hasDate, projectDate, stageInflows } from "./projects";
import { ensureSalaryRecords, isPaid, localDate, monthLabel, projectSalaryCharges, type EmployeeFull } from "./salary";

// Ledger and dashboard rules ported from the desktop app (BuildLedgerEntries,
// BuildProjectLedgerEntries, BuildTrendBuckets, BuildProjectFinanceSummary).

export type LedgerType = "Stage Payment" | "Project Expense" | "General Expense" | "Employee Salary";

export interface LedgerEntry {
  date: Date;
  type: LedgerType;
  source: string;
  details: string;
  inflow: boolean;
  amount: number;
  href?: string;
}

const pct = (n: number) => `${Number(n.toFixed(2))}%`;

function expenseDetails(e: { type?: string; title: string; addedByUserName?: string | null }) {
  const details = (e.type ?? "").trim() ? `${e.type} - ${e.title}` : e.title;
  return e.addedByUserName?.trim() ? `${details} (added by ${e.addedByUserName})` : details;
}

function projectEntries(p: ProjectLite): LedgerEntry[] {
  const id = p._id.toHexString();
  const href = `/portal/projects/${id}`;
  return [
    ...stageInflows(p).map((f) => ({ date: f.date, type: "Stage Payment" as const, source: p.name, details: f.title, inflow: true, amount: f.amount, href })),
    ...p.expenses.map((e) => ({
      date: expenseDate(p, e.transactionDate),
      type: "Project Expense" as const,
      source: p.name,
      details: expenseDetails(e),
      inflow: false,
      amount: totalAmount(e),
      href: `${href}/expenses/${e.index}`,
    })),
  ];
}

// Everything the company received or paid out.
export function buildLedgerEntries(projects: ProjectLite[], general: GeneralExpenseLite[], employees: EmployeeFull[]): LedgerEntry[] {
  const out: LedgerEntry[] = projects.flatMap(projectEntries);
  for (const e of general) {
    out.push({
      date: new Date(e.transactionDate),
      type: "General Expense",
      source: "General",
      details: (e.type ?? "").trim() ? `${e.type} - ${e.title}` : e.title,
      inflow: false,
      amount: totalAmount(e),
      href: `/portal/expenses/${e._id.toHexString()}`,
    });
  }
  for (const emp of employees) {
    for (const r of ensureSalaryRecords(emp).records.filter(isPaid)) {
      const shares = r.projectShares ?? [];
      out.push({
        date: new Date(r.paidAt!),
        type: "Employee Salary",
        source: emp.name,
        details: shares.length ? `Salary ${monthLabel(r.month)} - ${shares.map((s) => `${s.projectName} ${pct(num(s.percent))}`).join(", ")}` : `Salary ${monthLabel(r.month)}`,
        inflow: false,
        amount: num(r.amount),
        href: `/portal/employees/${emp._id.toHexString()}`,
      });
    }
  }
  return out;
}

// One project's money: its stage payments, its expenses and the salary charged to it.
export function buildProjectLedgerEntries(project: ProjectLite, employees: EmployeeFull[]): LedgerEntry[] {
  const id = project._id.toHexString();
  return [
    ...projectEntries(project),
    ...projectSalaryCharges(employees, id).map((c) => ({
      date: c.date,
      type: "Employee Salary" as const,
      source: c.employeeName,
      details: `Salary ${c.month} - ${pct(c.percent)}`,
      inflow: false,
      amount: c.amount,
    })),
  ];
}

export const sortLedger = (entries: LedgerEntry[]) =>
  [...entries].sort(
    (a, b) =>
      b.date.getTime() - a.date.getTime() ||
      Number(b.inflow) - Number(a.inflow) ||
      a.source.localeCompare(b.source),
  );

// ---- Oman calendar helpers ---------------------------------------------------------------
const OMAN = 4 * 3600e3;
export function omanParts(d: Date) {
  const x = new Date(new Date(d).getTime() + OMAN);
  return { y: x.getUTCFullYear(), m: x.getUTCMonth(), d: x.getUTCDate(), dow: x.getUTCDay() };
}
export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export function recentYears(count = 6) {
  const y = omanParts(new Date()).y;
  return Array.from({ length: count }, (_, i) => y - i);
}

// Ledger date filter (LedgerEntryMatchesDateFilter). `date` is a yyyy-mm-dd input value.
export function ledgerDateMatch(d: Date, filter: string, opts: { date?: string; year: number; month: number }) {
  const p = omanParts(d);
  const t = omanParts(new Date());
  switch (filter) {
    case "today":
      return p.y === t.y && p.m === t.m && p.d === t.d;
    case "month":
      return p.y === t.y && p.m === t.m;
    case "year":
      return p.y === t.y;
    case "date": {
      const [y, m, day] = (opts.date ?? "").split("-").map(Number);
      return !!y && p.y === y && p.m === m - 1 && p.d === day;
    }
    case "smonth":
      return p.y === opts.year && p.m === opts.month - 1;
    case "syear":
      return p.y === opts.year;
    default:
      return true;
  }
}

// ---- Dashboard periods (BuildTrendBuckets) ------------------------------------------------
export type Period = "week" | "month" | "year" | "smonth" | "syear";
export interface Bucket {
  start: Date;
  end: Date;
  label: string;
}

export function periodBuckets(period: Period, year: number, month: number): Bucket[] {
  const t = omanParts(new Date());
  const buckets: Bucket[] = [];
  if (period === "week") {
    const sinceMonday = (t.dow + 6) % 7;
    for (let i = 0; i < 7; i++) {
      const start = localDate(t.y, t.m, t.d - sinceMonday + i);
      buckets.push({ start, end: localDate(t.y, t.m, t.d - sinceMonday + i + 1), label: start.toLocaleDateString("en-GB", { weekday: "short", timeZone: "Asia/Muscat" }) });
    }
  } else if (period === "year" || period === "syear") {
    const y = period === "syear" ? year : t.y;
    for (let m = 0; m < 12; m++) buckets.push({ start: localDate(y, m, 1), end: localDate(y, m + 1, 1), label: MONTHS[m].slice(0, 3) });
  } else {
    const y = period === "smonth" ? year : t.y;
    const m = period === "smonth" ? month - 1 : t.m;
    const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    for (let d = 1; d <= days; d++) buckets.push({ start: localDate(y, m, d), end: localDate(y, m, d + 1), label: String(d) });
  }
  return buckets;
}

export const inRange = (d: Date, start: Date, end: Date) => d.getTime() >= start.getTime() && d.getTime() < end.getTime();

// ExpenseTaxPortion: VAT carved out of a tax-inclusive amount, or added on top otherwise.
export function expenseTaxPortion(e: { amount: unknown; includesVat: boolean; taxPercent: unknown }) {
  const amount = num(e.amount);
  const rate = num(e.taxPercent);
  if (rate <= 0) return 0;
  return e.includesVat ? (amount * rate) / (100 + rate) : (amount * rate) / 100;
}

// BuildProjectFinanceSummary: one project's money movement inside a date range.
export function projectFinanceSummary(project: ProjectLite, employees: EmployeeFull[], start: Date, end: Date) {
  let receivedBase = 0;
  for (const clause of project.clauses ?? []) {
    const payments = [...(clause.payments ?? [])].sort((a, b) => new Date(a.paidAt).getTime() - new Date(b.paidAt).getTime());
    if (payments.length) {
      let collected = 0;
      for (const p of payments) {
        const counted = Math.min(num(p.amount), Math.max(0, num(clause.paymentAmount) - collected));
        collected += counted;
        if (inRange(new Date(p.paidAt), start, end)) receivedBase += counted;
      }
    } else {
      const settled = clauseSettled(clause);
      const closed = hasDate(clause.closedAt) ? new Date(clause.closedAt!) : projectDate(project);
      if (settled > 0 && inRange(closed, start, end)) receivedBase += settled;
    }
  }
  const taxCollected = receivedBase * VAT_RATE;
  const expenses = project.expenses.filter((e) => inRange(expenseDate(project, e.transactionDate), start, end));
  const salaries = projectSalaryCharges(employees, project._id.toHexString())
    .filter((c) => inRange(c.date, start, end))
    .reduce((s, c) => s + c.amount, 0);
  const received = receivedBase + taxCollected;
  const spent = expenses.reduce((s, e) => s + totalAmount(e), 0);
  return {
    project,
    received,
    taxCollected,
    expenses: spent,
    taxPaid: expenses.reduce((s, e) => s + expenseTaxPortion(e), 0),
    salaries,
    net: received - spent - salaries,
    hasActivity: received !== 0 || spent !== 0 || salaries !== 0,
  };
}

export const projectPercent = (e: EmployeeFull, projectId: string) =>
  (e.projectAllocations ?? []).filter((a) => a.projectId === projectId).reduce((s, a) => s + num(a.percent), 0);
