import "server-only";
import type { ObjectId } from "mongodb";
import { num } from "./decimal";

// Salary rules ported from the desktop app's Employee model (EnsureSalaryRecords etc.).
// All calendar maths is done in Oman time, the same "local time" the desktop app uses.

const OMAN = 4 * 3600 * 1000;

export interface SalaryShare {
  projectId: string;
  projectName: string;
  percent: unknown;
  amount: unknown;
}

export interface SalaryRecord {
  month: Date;
  amount: unknown;
  dueDate?: Date | null;
  paidAt?: Date | null;
  projectShares?: SalaryShare[];
}

export interface Allocation {
  projectId: string;
  projectName: string;
  percent: unknown;
}

export interface EmployeeFull {
  _id: ObjectId;
  name: string;
  designation: string;
  phone: string;
  monthlySalary: unknown;
  joiningDate: Date;
  status: string;
  disabledAt?: Date | null;
  salaryPayments?: SalaryRecord[];
  createdAt: Date;
  projectAllocations?: Allocation[];
}

const parts = (d: Date) => {
  const x = new Date(new Date(d).getTime() + OMAN);
  return { y: x.getUTCFullYear(), m: x.getUTCMonth(), d: x.getUTCDate() };
};
// Oman midnight of a calendar date, as an instant (what the desktop app stores).
export const localDate = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d) - OMAN);
export const monthStart = (d: Date) => {
  const p = parts(d);
  return localDate(p.y, p.m, 1);
};
const addMonths = (month: Date, n: number) => {
  const p = parts(month);
  return localDate(p.y, p.m + n, 1);
};
export const todayLocal = () => {
  const p = parts(new Date());
  return localDate(p.y, p.m, p.d);
};
const dayOf = (d: Date) => {
  const p = parts(d);
  return localDate(p.y, p.m, p.d).getTime();
};

// A month's salary falls due on the 5th of the following month.
export const salaryDueDate = (month: Date) => {
  const p = parts(month);
  return localDate(p.y, p.m + 1, 5);
};

export const monthLabel = (month: Date) =>
  new Date(month).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "Asia/Muscat" });

export const isDisabled = (e: Pick<EmployeeFull, "status">) => (e.status ?? "").toLowerCase() === "disabled";
export const isPaid = (r: SalaryRecord) => !!r.paidAt;
export const effectiveDue = (r: SalaryRecord) => (r.dueDate ? new Date(r.dueDate) : salaryDueDate(r.month));

export function recordStatus(r: SalaryRecord, today = todayLocal()): "Paid" | "Overdue" | "Pending" {
  if (isPaid(r)) return "Paid";
  return today.getTime() > dayOf(effectiveDue(r)) ? "Overdue" : "Pending";
}

// EnsureSalaryRecords: fills in missing months up to today (or the last working day) and tidies
// existing ones. Returns a new list (newest first) and whether anything changed.
export function ensureSalaryRecords(e: EmployeeFull, throughDate?: Date): { records: SalaryRecord[]; changed: boolean } {
  let changed = false;
  const monthly = num(e.monthlySalary);
  const firstMonth = monthStart(e.joiningDate);
  let finalDate = throughDate ?? todayLocal();
  if (isDisabled(e) && e.disabledAt && new Date(e.disabledAt) < finalDate) finalDate = new Date(e.disabledAt);
  const lastMonth = monthStart(finalDate);

  let records: SalaryRecord[] = (e.salaryPayments ?? []).map((r) => ({ ...r, projectShares: [...(r.projectShares ?? [])] }));

  // Unpaid months before joining don't belong here; paid ones stay (money already went out).
  const before = records.length;
  records = records.filter((r) => isPaid(r) || monthStart(r.month) >= firstMonth);
  if (records.length !== before) changed = true;

  if (isDisabled(e)) {
    const n = records.length;
    records = records.filter((r) => isPaid(r) || new Date(r.month) <= lastMonth);
    if (records.length !== n) changed = true;
  }

  for (const r of records) {
    const normalized = monthStart(r.month);
    if (new Date(r.month).getTime() !== normalized.getTime()) {
      r.month = normalized;
      changed = true;
    }
    if (num(r.amount) <= 0) {
      r.amount = monthly;
      changed = true;
    }
    const expected = salaryDueDate(r.month);
    if (!r.dueDate || (!isPaid(r) && dayOf(r.dueDate) !== expected.getTime())) {
      r.dueDate = expected;
      changed = true;
    }
  }

  for (let m = firstMonth; m <= lastMonth; m = addMonths(m, 1)) {
    if (records.some((r) => new Date(r.month).getTime() === m.getTime())) continue;
    records.push({ month: m, amount: amountForMonth(records, m, monthly), dueDate: salaryDueDate(m), paidAt: null, projectShares: [] });
    changed = true;
  }

  records.sort((a, b) => new Date(b.month).getTime() - new Date(a.month).getTime());
  return { records, changed };
}

// GetSalaryAmountForMonth: the latest earlier month's salary, or the current monthly salary.
function amountForMonth(records: SalaryRecord[], month: Date, monthly: number): number {
  const prev = records
    .filter((r) => new Date(r.month) < month && num(r.amount) > 0)
    .sort((a, b) => new Date(b.month).getTime() - new Date(a.month).getTime())[0];
  return prev ? num(prev.amount) : monthly;
}

// BuildProjectShares: how a paid salary is charged to projects, fixed at payment time.
export function buildProjectShares(allocations: Allocation[] | undefined, amount: number) {
  return (allocations ?? [])
    .filter((a) => num(a.percent) > 0 && a.projectId)
    .map((a) => ({ projectId: a.projectId, projectName: a.projectName, percent: num(a.percent), amount: Math.round(((amount * num(a.percent)) / 100) * 1000) / 1000 }));
}

export function salarySummary(e: EmployeeFull) {
  const { records } = ensureSalaryRecords(e);
  const today = todayLocal();
  const paid = records.filter(isPaid).reduce((s, r) => s + num(r.amount), 0);
  const unpaid = records.filter((r) => !isPaid(r));
  const pending = unpaid.reduce((s, r) => s + num(r.amount), 0);
  const overdueMonths = unpaid.filter((r) => recordStatus(r, today) === "Overdue").length;
  const overall: "Paid" | "Pending" | "Overdue" = overdueMonths > 0 ? "Overdue" : unpaid.length ? "Pending" : "Paid";
  return { records, paid, pending, overdueMonths, overall, current: isDisabled(e) ? ("Disabled" as const) : overall };
}

export function allocationDisplay(e: Pick<EmployeeFull, "projectAllocations">) {
  const list = e.projectAllocations ?? [];
  return list.length ? list.map((a) => `${a.projectName} ${Number(num(a.percent).toFixed(2))}%`).join(", ") : "Overhead";
}

// GetProjectSalaryCharges: paid salary charged to one project, dated when paid.
export function projectSalaryCharges(employees: EmployeeFull[], projectId: string) {
  const out: Array<{ date: Date; employeeName: string; month: string; percent: number; amount: number }> = [];
  for (const e of employees) {
    for (const r of e.salaryPayments ?? []) {
      if (!r.paidAt) continue;
      for (const s of r.projectShares ?? []) {
        if (s.projectId === projectId) out.push({ date: new Date(r.paidAt), employeeName: e.name, month: monthLabel(r.month), percent: num(s.percent), amount: num(s.amount) });
      }
    }
  }
  return out;
}
