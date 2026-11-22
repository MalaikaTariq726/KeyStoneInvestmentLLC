import "server-only";
import type { ObjectId } from "mongodb";
import { num } from "./decimal";

// Shapes of the desktop app's MongoDB documents (only the fields the portal uses) plus the
// same calculations the desktop app performs, so both show identical numbers.
//
// IMPORTANT when writing: several of the desktop app's C# models (users, credit grants,
// project expenses, file attachments) do NOT ignore unknown fields - an extra field would
// make the desktop app fail to load that document. Only ever write the exact fields below.

type Money = unknown; // string | Decimal128 | number, read with num()

export interface UserDoc {
  _id: ObjectId;
  fullName: string;
  email: string;
  passwordHash: string;
  role?: string;
  employeeId?: string | null;
  employeeName?: string;
  creditGrants?: Array<{ amount: Money; note: string; grantedAt: Date; grantedBy: string }>;
}

export interface AttachmentDoc {
  fileName: string;
  contentType: string;
  base64: string;
}

export interface ClaimDoc {
  _id: ObjectId;
  userId: string;
  userName: string;
  claimType: string;
  projectId?: string | null;
  projectName: string;
  expenseType?: string;
  title: string;
  description: string;
  amount: Money;
  claimDate: Date;
  status: string;
  createdAt: Date;
  decidedAt?: Date | null;
  proofImageBase64?: string | null;
  attachments?: AttachmentDoc[];
  includesVat: boolean;
  taxPercent: Money;
  fundedByCredit?: boolean;
}

export interface ProjectExpenseDoc {
  type: string;
  title: string;
  amount: Money;
  transactionDate: Date;
  sourceClaimId?: string | null;
  sourceSubcontractorClauseId?: string | null;
  includesVat: boolean;
  taxPercent: Money;
  invoiceImageBase64?: string | null;
  attachments?: AttachmentDoc[];
  addedByUserName: string;
}

export interface ClauseDoc {
  title: string;
  paymentType?: string;
  percentage?: Money;
  paymentAmount: Money;
  status: string;
  amountPaid?: Money;
  closedAt?: Date;
  payments?: Array<{ amount: Money; paidAt: Date; note: string; recordedBy: string }>;
}

export interface ProjectDoc {
  _id: ObjectId;
  clientName: string;
  name: string;
  description: string;
  contractValue: Money;
  natureOfProject: string;
  clauses?: ClauseDoc[];
  expenses?: ProjectExpenseDoc[];
  status: string;
  createdAt: Date;
}

export interface GeneralExpenseDoc {
  _id: ObjectId;
  title: string;
  type: string;
  amount: Money;
  transactionDate: Date;
  sourceClaimId?: string | null;
  includesVat: boolean;
  taxPercent: Money;
  invoiceImageBase64?: string | null;
  attachments?: AttachmentDoc[];
  addedByUserName: string;
}

export interface EmployeeDoc {
  _id: ObjectId;
  name: string;
  designation: string;
  status: string;
}

export const VAT_RATE = 0.05;

const eq = (a: string | undefined | null, b: string) => (a ?? "").trim().toLowerCase() === b;

export function isAdminRole(role: string | undefined): boolean {
  return eq(role, "admin");
}

export function roleOf(role: string | undefined): "Admin" | "User" {
  return isAdminRole(role) ? "Admin" : "User";
}

// ClaimDocument.TotalAmount / ProjectExpense.TotalAmount / GeneralExpense.TotalAmount
export function totalAmount(item: { amount: Money; includesVat: boolean; taxPercent: Money }): number {
  const amount = num(item.amount);
  return item.includesVat ? amount : amount + (amount * num(item.taxPercent)) / 100;
}

// ProjectClause.SettledAmount
export function clauseSettled(clause: ClauseDoc): number {
  const paymentAmount = num(clause.paymentAmount);
  const recorded = (clause.payments ?? []).reduce((sum, p) => sum + num(p.amount), 0);
  if (recorded > 0) return Math.min(paymentAmount, recorded);
  const status = (clause.status ?? "").toLowerCase();
  if (["processed", "paid", "payed", "closed"].includes(status)) return paymentAmount;
  if (status === "partially paid") return Math.min(Math.max(num(clause.amountPaid), 0), paymentAmount);
  return 0;
}

export function projectIsPending(project: Pick<ProjectDoc, "status">): boolean {
  return eq(project.status, "pending");
}

// AdminProject.TotalPayment (collected from the client, including VAT)
export function projectReceived(project: ProjectDoc): number {
  if (projectIsPending(project)) return 0;
  const subtotal = (project.clauses ?? []).reduce((sum, c) => sum + clauseSettled(c), 0);
  return subtotal + subtotal * VAT_RATE;
}

// AdminProject.TotalExpenses
export function projectSpent(project: ProjectDoc): number {
  return (project.expenses ?? []).reduce((sum, e) => sum + totalAmount(e), 0);
}

// Credit, as the desktop app's GetCreditOutstanding / GetCreditAvailable work it out.
export function creditSummary(user: Pick<UserDoc, "_id" | "creditGrants">, claims: ClaimDoc[]) {
  const id = user._id.toHexString();
  const granted = (user.creditGrants ?? []).reduce((sum, g) => sum + num(g.amount), 0);
  const mine = claims.filter((c) => c.fundedByCredit && c.userId === id);
  const used = mine.filter((c) => eq(c.status, "approved")).reduce((s, c) => s + totalAmount(c), 0);
  const pending = mine.filter((c) => eq(c.status, "pending")).reduce((s, c) => s + totalAmount(c), 0);
  const outstanding = Math.max(0, granted - used);
  return { granted, used, pending, outstanding, available: Math.max(0, outstanding - pending) };
}

export function allAttachments(legacyBase64: string | null | undefined, list: AttachmentDoc[] | undefined): AttachmentDoc[] {
  const all: AttachmentDoc[] = [];
  if (legacyBase64 && legacyBase64.trim()) all.push({ fileName: "Invoice image.jpg", contentType: "image/jpeg", base64: legacyBase64 });
  for (const a of list ?? []) if (a?.base64 && a.base64.trim()) all.push(a);
  return all;
}

export const MAX_FILE_BYTES = 3 * 1024 * 1024; // same per-file cap as the desktop app
// The desktop app allows 8 MB in total, but a web upload has to fit in one request and
// Vercel caps request bodies at about 4.5 MB, so the portal keeps the total under 4 MB.
export const MAX_TOTAL_BYTES = 4 * 1024 * 1024;

export function base64Bytes(b64: string): number {
  return Math.floor((b64.length * 3) / 4);
}
