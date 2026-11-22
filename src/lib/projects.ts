import "server-only";
import { num } from "./decimal";
import { clauseSettled, VAT_RATE, type ClauseDoc, type ProjectDoc } from "./models";

// Project rules ported from the desktop app (AdminDashboardWindow.xaml.cs) so both apps agree.

// C# DateTime.MinValue as MongoDB stores it - the desktop app's "no date" value.
export const MIN_DATE = new Date(-62135596800000);

export function hasDate(d: Date | null | undefined): d is Date {
  return !!d && new Date(d).getUTCFullYear() > 1971;
}

export const PROJECT_NATURES = [
  "Design",
  "Design - Consultancy",
  "Construction - Gray Structure",
  "Construction - Gray Structure + Finishes",
  "Construction - Finishes Only Labour",
] as const;

// What can be picked in the stage editor; legacy values are normalised onto these.
export const STAGE_STATUSES = ["Pending", "Processing", "Paid"] as const;

export function normalizeStageStatus(status: string): (typeof STAGE_STATUSES)[number] {
  if ((STAGE_STATUSES as readonly string[]).includes(status)) return status as (typeof STAGE_STATUSES)[number];
  const s = (status ?? "").toLowerCase();
  if (s === "partially paid") return "Processing";
  if (["processed", "closed", "payed"].includes(s)) return "Paid";
  return "Pending";
}

// AdminProject.ContractValueBase - contract value is VAT-inclusive, stages are worked out on the base.
export function contractBase(contractValue: number) {
  return contractValue / (1 + VAT_RATE);
}

export function clauseAmountFor(paymentType: string, value: number, base: number) {
  return paymentType.toLowerCase() === "amount" ? value : base * (value / 100);
}

export function effectivePercentage(paymentAmount: number, base: number) {
  return base === 0 ? 0 : (paymentAmount / base) * 100;
}

export function clauseRemaining(clause: ClauseDoc) {
  return Math.max(0, num(clause.paymentAmount) - clauseSettled(clause));
}

export function clauseIsPartiallyPaid(clause: ClauseDoc) {
  return clauseSettled(clause) > 0 && clauseRemaining(clause) > 0.01;
}

const isIncluded = (status: string) => ["processed", "paid", "payed", "closed"].includes((status ?? "").toLowerCase());

// SyncClauseStatusFromPayments: once instalments exist, status follows what was collected.
export function syncedStatus(clause: ClauseDoc): string {
  if (!(clause.payments ?? []).length) return clause.status;
  return clauseRemaining(clause) <= 0.01 ? "Paid" : "Partially Paid";
}

// UpdateProjectStatusFromClauses
export function projectStatusFromClauses(clauses: ClauseDoc[]): string {
  if (!clauses.length) return "Pending";
  if (clauses.every((c) => (c.status ?? "").toLowerCase() === "closed")) return "Closed";
  if (clauses.some((c) => isIncluded(c.status) || clauseIsPartiallyPaid(c) || (c.status ?? "").toLowerCase() === "processing")) return "Processing";
  return "Pending";
}

// GetProjectDate: createdAt, or the ObjectId's creation time for very old records.
export function projectDate(project: Pick<ProjectDoc, "createdAt" | "_id">): Date {
  if (hasDate(project.createdAt)) return new Date(project.createdAt);
  return project._id.getTimestamp();
}

// GetStageInflows: money in from the client, VAT included, dated by instalment.
export function stageInflows(project: Pick<ProjectDoc, "clauses" | "createdAt" | "_id">): Array<{ date: Date; title: string; amount: number }> {
  const out: Array<{ date: Date; title: string; amount: number }> = [];
  for (const clause of project.clauses ?? []) {
    if (!(isIncluded(clause.status) || clauseIsPartiallyPaid(clause))) continue;
    const payments = [...(clause.payments ?? [])].sort((a, b) => new Date(a.paidAt).getTime() - new Date(b.paidAt).getTime());
    if (payments.length) {
      let collected = 0;
      const total = num(clause.paymentAmount);
      for (const p of payments) {
        const counted = Math.min(num(p.amount), Math.max(0, total - collected));
        collected += counted;
        if (counted > 0) out.push({ date: new Date(p.paidAt), title: clause.title, amount: counted * (1 + VAT_RATE) });
      }
      continue;
    }
    const settled = clauseSettled(clause);
    out.push({ date: hasDate(clause.closedAt) ? new Date(clause.closedAt!) : projectDate(project), title: clause.title, amount: settled * (1 + VAT_RATE) });
  }
  return out;
}

export function expenseDate(project: Pick<ProjectDoc, "createdAt" | "_id">, transactionDate: Date | null | undefined): Date {
  return hasDate(transactionDate) ? new Date(transactionDate) : projectDate(project);
}
