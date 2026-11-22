"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { ObjectId, type Db } from "mongodb";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { C, getDb } from "@/lib/db";
import { dec, getDecimalStyle, num, type DecimalStyle } from "@/lib/decimal";
import { dateInputToStored, EXPENSE_TYPES } from "@/lib/format";
import { buildPaymentInvoice, buildStageInvoice, nextInvoiceNumber, type PaymentLine } from "@/lib/invoice";
import { base64Bytes, MAX_FILE_BYTES, MAX_TOTAL_BYTES, allAttachments, type AttachmentDoc, type ClauseDoc, type ProjectDoc, type ProjectExpenseDoc } from "@/lib/models";
import {
  clauseAmountFor,
  clauseRemaining,
  contractBase,
  effectivePercentage,
  hasDate,
  MIN_DATE,
  normalizeStageStatus,
  projectStatusFromClauses,
  syncedStatus,
} from "@/lib/projects";

export type Result = { ok: true; id?: string; invoiceId?: string } | { ok: false; error: string };
const fail = (error: string): Result => ({ ok: false, error });

async function admin() {
  const me = await getCurrentUser();
  return me?.isAdmin ? me : null;
}

function oid(id: string) {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
}

// Projects are read without the heavy parts (saved invoice HTML, expense attachments).
async function loadProject(db: Db, id: ObjectId) {
  return db.collection<ProjectDoc & { invoiceHistory?: unknown[] }>(C.projects).findOne(
    { _id: id },
    { projection: { invoiceHistory: 0, "expenses.attachments.base64": 0, "expenses.invoiceImageBase64": 0, subcontractorAgreements: 0 } },
  );
}

// Writes a clause with exactly the desktop app's ProjectClause fields (that model rejects unknown ones).
function clauseDoc(c: { title: string; paymentType: string; percentage: number; paymentAmount: number; status: string; amountPaid: number; closedAt: Date; payments: ClauseDoc["payments"] }, style: DecimalStyle) {
  return {
    title: c.title,
    paymentType: c.paymentType,
    percentage: dec(c.percentage, style),
    paymentAmount: dec(c.paymentAmount, style),
    status: c.status,
    amountPaid: dec(c.amountPaid, style),
    closedAt: c.closedAt,
    payments: (c.payments ?? []).map((p) => ({ amount: p.amount, paidAt: p.paidAt, note: p.note ?? "", recordedBy: p.recordedBy ?? "" })),
  };
}

const refresh = (id?: string) => {
  revalidatePath("/portal", "layout");
  if (id) revalidatePath(`/portal/projects/${id}`);
};

// ---------------- project details ----------------

const detailsSchema = z.object({
  clientName: z.string().trim().min(1, "Enter the client name.").max(200),
  name: z.string().trim().min(1, "Enter the project name.").max(200),
  description: z.string().trim().min(1, "Enter a short description.").max(4000),
  contractValue: z.coerce.number().min(0, "Contract value cannot be negative.").max(10_000_000_000),
  // One of the standard options; an older value already on the project is kept as-is.
  natureOfProject: z.string().trim().min(1, "Choose the work description.").max(200),
});

export async function createProject(input: unknown): Promise<Result> {
  if (!(await admin())) return fail("Only admins can create projects.");
  const parsed = detailsSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form.");
  const d = parsed.data;
  const db = await getDb();
  const style = await getDecimalStyle(db);
  // Same fields (and order of concerns) as a new AdminProject in the desktop app.
  const result = await db.collection(C.projects).insertOne({
    clientName: d.clientName,
    name: d.name,
    description: d.description,
    contractValue: dec(d.contractValue, style),
    natureOfProject: d.natureOfProject,
    clauses: [],
    expenses: [],
    subcontractorAgreements: [],
    invoiceHistory: [],
    status: "Pending",
    createdAt: new Date(),
  });
  refresh();
  return { ok: true, id: result.insertedId.toHexString() };
}

export async function updateProjectDetails(projectId: string, input: unknown): Promise<Result> {
  const me = await admin();
  if (!me) return fail("Only admins can edit projects.");
  const id = oid(projectId);
  if (!id) return fail("Project not found.");
  const parsed = detailsSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form.");
  const d = parsed.data;
  const db = await getDb();
  const style = await getDecimalStyle(db);
  const project = await loadProject(db, id);
  if (!project) return fail("Project not found.");

  // RecalculateClausePayments: percentage stages follow the new contract value; fixed-amount
  // stages keep their amount and only their equivalent percentage changes.
  const base = contractBase(d.contractValue);
  const set: Record<string, unknown> = {
    clientName: d.clientName,
    name: d.name,
    description: d.description,
    contractValue: dec(d.contractValue, style),
    natureOfProject: d.natureOfProject,
  };
  (project.clauses ?? []).forEach((c, i) => {
    if ((c.paymentType ?? "").toLowerCase() === "amount") {
      set[`clauses.${i}.percentage`] = dec(effectivePercentage(num(c.paymentAmount), base), style);
    } else {
      set[`clauses.${i}.paymentAmount`] = dec(base * (num(c.percentage) / 100), style);
    }
  });
  await db.collection(C.projects).updateOne({ _id: id }, { $set: set });

  // Claims keep a copy of the project name (as in the desktop app) - keep it current.
  if (project.name !== d.name) {
    await db.collection(C.claims).updateMany({ projectId }, { $set: { projectName: d.name } });
  }
  refresh(projectId);
  return { ok: true, id: projectId };
}

export async function deleteProject(projectId: string, confirmName: string): Promise<Result> {
  if (!(await admin())) return fail("Only admins can delete projects.");
  const id = oid(projectId);
  if (!id) return fail("Project not found.");
  const db = await getDb();
  const project = await db.collection<ProjectDoc>(C.projects).findOne({ _id: id }, { projection: { name: 1 } });
  if (!project) return fail("Project not found.");
  if (confirmName.trim() !== project.name.trim()) return fail("Type the project name exactly to confirm.");
  await db.collection(C.projects).deleteOne({ _id: id });
  // The desktop app removes the project's claims along with it.
  await db.collection(C.claims).deleteMany({ projectId });
  refresh();
  return { ok: true };
}

// ---------------- stages ----------------

const stagesSchema = z.object({
  stages: z
    .array(
      z.object({
        title: z.string().trim().min(1, "Each stage needs a title.").max(500),
        paymentType: z.enum(["Percentage", "Amount"]),
        value: z.coerce.number().min(0, "Negative values are not allowed."),
        status: z.string().optional(),
      }),
    )
    .min(1, "At least one stage is required.")
    .max(100),
});

export async function saveStages(projectId: string, input: unknown): Promise<Result> {
  if (!(await admin())) return fail("Only admins can edit stages.");
  const id = oid(projectId);
  if (!id) return fail("Project not found.");
  const parsed = stagesSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the stages.");

  const db = await getDb();
  const style = await getDecimalStyle(db);
  const project = await loadProject(db, id);
  if (!project) return fail("Project not found.");

  const base = contractBase(num(project.contractValue));
  const total = parsed.data.stages.reduce((s, st) => s + clauseAmountFor(st.paymentType, st.value, base), 0);
  if (Math.abs(total - base) > 0.01) {
    return fail(`Stages must add up to the contract value excluding tax (OMR ${base.toFixed(3)}). Current total is OMR ${total.toFixed(3)}.`);
  }

  const existing = project.clauses ?? [];
  const isFirstSetup = existing.length === 0;
  const rebuilt = parsed.data.stages.map((st) => {
    const paymentAmount = clauseAmountFor(st.paymentType, st.value, base);
    const percentage = st.paymentType === "Amount" ? effectivePercentage(st.value, base) : st.value;
    // Matched by title like the desktop app, so recorded instalments survive edits.
    const prior = existing.find((c) => c.title.trim().toLowerCase() === st.title.trim().toLowerCase());
    const status = isFirstSetup ? "Pending" : normalizeStageStatus(st.status ?? "Pending");
    const clause: ClauseDoc = {
      title: st.title,
      paymentType: st.paymentType,
      percentage,
      paymentAmount,
      status,
      amountPaid: prior?.amountPaid ?? 0,
      closedAt: status.toLowerCase() === "closed" ? (hasDate(prior?.closedAt) ? prior!.closedAt : new Date()) : MIN_DATE,
      payments: prior?.payments ?? [],
    };
    clause.status = syncedStatus(clause);
    return clause;
  });

  // First-time setup marks the project Processing (as the desktop app does); edits derive it.
  const projectStatus = isFirstSetup ? "Processing" : projectStatusFromClauses(rebuilt);
  await db.collection(C.projects).updateOne(
    { _id: id },
    {
      $set: {
        clauses: rebuilt.map((c) =>
          clauseDoc(
            {
              ...c,
              paymentType: c.paymentType ?? "Percentage",
              percentage: num(c.percentage),
              paymentAmount: num(c.paymentAmount),
              amountPaid: num(c.amountPaid),
              closedAt: c.closedAt ?? MIN_DATE,
              payments: c.payments,
            },
            style,
          ),
        ),
        status: projectStatus,
      },
    },
  );
  refresh(projectId);
  return { ok: true, id: projectId };
}

// ---------------- payments & invoices ----------------

const paymentSchema = z.object({
  lines: z.array(z.object({ index: z.number().int().min(0), title: z.string(), amount: z.coerce.number().min(0) })),
  note: z.string().trim().max(500).default(""),
});

export async function recordPayment(projectId: string, input: unknown): Promise<Result> {
  const me = await admin();
  if (!me) return fail("Only admins can record payments.");
  const id = oid(projectId);
  if (!id) return fail("Project not found.");
  const parsed = paymentSchema.safeParse(input);
  if (!parsed.success) return fail("Check the amounts.");

  const db = await getDb();
  const style = await getDecimalStyle(db);
  const project = await loadProject(db, id);
  if (!project) return fail("Project not found.");
  const clauses = project.clauses ?? [];

  const lines = parsed.data.lines.filter((l) => l.amount > 0);
  if (!lines.length) return fail("Enter an amount for at least one stage.");
  const now = new Date();
  const set: Record<string, unknown> = {};
  const push: Record<string, unknown> = {};
  const filter: Record<string, unknown> = { _id: id };
  const invoiceLines: PaymentLine[] = [];
  const updated = clauses.map((c) => ({ ...c, payments: [...(c.payments ?? [])] }));

  for (const line of lines) {
    const clause = updated[line.index];
    if (!clause || clause.title !== line.title) return fail("The stages changed while you were editing. Reload and try again.");
    const remaining = clauseRemaining(clause);
    if (line.amount > remaining + 0.01) return fail(`"${clause.title}" only has OMR ${remaining.toFixed(3)} remaining - reduce the amount.`);
    const payment = { amount: dec(line.amount, style), paidAt: now, note: parsed.data.note, recordedBy: me.fullName };
    clause.payments.push(payment);
    clause.status = syncedStatus(clause);
    push[`clauses.${line.index}.payments`] = payment;
    set[`clauses.${line.index}.status`] = clause.status;
    filter[`clauses.${line.index}.title`] = clause.title; // guard against the list changing underneath
    invoiceLines.push({ clause, amount: line.amount, remainingAfter: clauseRemaining(clause) });
  }
  set.status = projectStatusFromClauses(updated);

  const result = await db.collection(C.projects).updateOne(filter, { $push: push, $set: set } as never);
  if (result.matchedCount === 0) return fail("The stages changed while you were editing. Reload and try again.");

  // Every recorded payment gets its invoice straight away, like the desktop app.
  const invoiceId = await saveInvoice(db, id, me.fullName, async (number) => {
    const inv = buildPaymentInvoice({ ...project, status: String(set.status) }, number, invoiceLines, now);
    return { html: inv.html, type: inv.kind, summary: inv.summary, subtotal: inv.subtotal, tax: inv.tax };
  });
  refresh(projectId);
  return { ok: true, invoiceId };
}

async function saveInvoice(
  db: Db,
  projectId: ObjectId,
  generatedBy: string,
  build: (invoiceNumber: string) => Promise<{ html: string; type: string; summary: string; subtotal: number; tax: number }>,
): Promise<string> {
  const style = await getDecimalStyle(db);
  const invoiceNumber = await nextInvoiceNumber(db);
  const inv = await build(invoiceNumber);
  const record = {
    // Exactly the desktop app's InvoiceRecord fields.
    id: randomUUID(),
    invoiceNumber,
    type: inv.type,
    summary: inv.summary,
    subtotal: dec(inv.subtotal, style),
    tax: dec(inv.tax, style),
    total: dec(inv.subtotal + inv.tax, style),
    generatedAt: new Date(),
    generatedBy,
    html: inv.html,
  };
  await db.collection(C.projects).updateOne({ _id: projectId }, { $push: { invoiceHistory: { $each: [record], $position: 0 } } } as never);
  return record.id;
}

export async function generateStageInvoice(projectId: string, stageIndexes: number[]): Promise<Result> {
  const me = await admin();
  if (!me) return fail("Only admins can print invoices.");
  const id = oid(projectId);
  if (!id) return fail("Project not found.");
  const db = await getDb();
  const project = await loadProject(db, id);
  if (!project) return fail("Project not found.");
  const clauses = project.clauses ?? [];
  const picked = [...new Set(stageIndexes)].filter((i) => clauses[i]).sort((a, b) => a - b).map((i) => clauses[i]);
  if (!picked.length) return fail("Select at least one stage to invoice.");
  const isPartial = picked.length !== clauses.length;

  const invoiceId = await saveInvoice(db, id, me.fullName, async (number) => {
    const inv = buildStageInvoice(project, number, picked, isPartial);
    return {
      html: inv.html,
      type: isPartial ? "Stage Invoice" : "Project Invoice",
      summary: isPartial ? picked.map((c) => c.title).join(", ") : "All stages",
      subtotal: inv.subtotal,
      tax: inv.tax,
    };
  });
  refresh(projectId);
  return { ok: true, invoiceId };
}

// Invoice for an earlier instalment, showing the balance as it was right after that payment.
export async function generatePastPaymentInvoice(projectId: string, stageIndex: number, paymentIndex: number): Promise<Result> {
  const me = await admin();
  if (!me) return fail("Only admins can print invoices.");
  const id = oid(projectId);
  if (!id) return fail("Project not found.");
  const db = await getDb();
  const project = await loadProject(db, id);
  const clause = project?.clauses?.[stageIndex];
  const payment = clause?.payments?.[paymentIndex];
  if (!project || !clause || !payment) return fail("Payment not found.");

  const ordered = [...(clause.payments ?? [])].sort((a, b) => new Date(a.paidAt).getTime() - new Date(b.paidAt).getTime());
  let running = 0;
  let remainingAfter = 0;
  for (const p of ordered) {
    running += num(p.amount);
    if (p === payment) {
      remainingAfter = Math.max(0, num(clause.paymentAmount) - running);
      break;
    }
  }

  const invoiceId = await saveInvoice(db, id, me.fullName, async (number) => {
    const inv = buildPaymentInvoice(project, number, [{ clause, amount: num(payment.amount), remainingAfter }], new Date(payment.paidAt));
    return { html: inv.html, type: inv.kind, summary: inv.summary, subtotal: inv.subtotal, tax: inv.tax };
  });
  refresh(projectId);
  return { ok: true, invoiceId };
}

// ---------------- expenses ----------------

const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/bmp", "application/pdf"];
const expenseEditSchema = z.object({
  title: z.string().trim().min(1, "Enter a title.").max(200),
  expenseType: z.enum(EXPENSE_TYPES),
  amount: z.coerce.number().min(0, "Enter a non-negative amount.").max(100_000_000),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  taxMode: z.enum(["added", "included", "none"]),
  taxPercent: z.coerce.number().min(0).max(100),
  keepAttachments: z.array(z.number().int().min(0)).default([]),
  newAttachments: z
    .array(z.object({ fileName: z.string().trim().min(1).max(200), contentType: z.string().refine((t) => ALLOWED.includes(t)), base64: z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/) }))
    .max(10)
    .default([]),
  // What the row looked like when the form opened, so a concurrent change isn't overwritten.
  expectedTitle: z.string(),
});

function checkFiles(list: AttachmentDoc[]): string | null {
  let total = 0;
  for (const a of list) {
    const size = base64Bytes(a.base64);
    if (size > MAX_FILE_BYTES) return `"${a.fileName}" is larger than 3 MB.`;
    total += size;
  }
  return total > MAX_TOTAL_BYTES ? "Attachments add up to more than 4 MB." : null;
}

function taxFields(mode: "added" | "included" | "none", percent: number) {
  return mode === "none" ? { includesVat: false, taxPercent: 0 } : { includesVat: mode === "included", taxPercent: percent };
}

export async function updateProjectExpense(projectId: string, index: number, input: unknown): Promise<Result> {
  if (!(await admin())) return fail("Only admins can edit expenses.");
  const id = oid(projectId);
  if (!id || !Number.isInteger(index) || index < 0) return fail("Expense not found.");
  const parsed = expenseEditSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form.");
  const d = parsed.data;

  const db = await getDb();
  const style = await getDecimalStyle(db);
  const project = await db.collection<ProjectDoc>(C.projects).findOne({ _id: id }, { projection: { [`expenses`]: { $slice: [index, 1] } } });
  const current = project?.expenses?.[0] as ProjectExpenseDoc | undefined;
  if (!current || current.title !== d.expectedTitle) return fail("This expense changed or was removed. Reload and try again.");
  if (current.sourceClaimId) return fail("Expenses created from an approved claim are locked.");

  const existingFiles = allAttachments(current.invoiceImageBase64, current.attachments);
  const files = [...d.keepAttachments.filter((i) => existingFiles[i]).map((i) => existingFiles[i]), ...d.newAttachments];
  const problem = checkFiles(files);
  if (problem) return fail(problem);

  const tax = taxFields(d.taxMode, d.taxPercent);
  const updated = {
    type: d.expenseType,
    title: d.title,
    amount: dec(d.amount, style),
    transactionDate: dateInputToStored(d.date),
    sourceClaimId: current.sourceClaimId ?? null,
    sourceSubcontractorClauseId: current.sourceSubcontractorClauseId ?? null,
    includesVat: tax.includesVat,
    taxPercent: dec(tax.taxPercent, style),
    invoiceImageBase64: null,
    attachments: files.map((f) => ({ fileName: f.fileName, contentType: f.contentType, base64: f.base64 })),
    addedByUserName: current.addedByUserName ?? "",
  };
  const result = await db
    .collection(C.projects)
    .updateOne({ _id: id, [`expenses.${index}.title`]: d.expectedTitle }, { $set: { [`expenses.${index}`]: updated } });
  if (result.matchedCount === 0) return fail("This expense changed or was removed. Reload and try again.");
  refresh(projectId);
  return { ok: true };
}

export async function deleteProjectExpense(projectId: string, index: number, expectedTitle: string): Promise<Result> {
  if (!(await admin())) return fail("Only admins can delete expenses.");
  const id = oid(projectId);
  if (!id || !Number.isInteger(index) || index < 0) return fail("Expense not found.");
  const db = await getDb();
  const project = await db.collection<ProjectDoc>(C.projects).findOne({ _id: id }, { projection: { expenses: { $slice: [index, 1] } } });
  const current = project?.expenses?.[0];
  if (!current || current.title !== expectedTitle) return fail("This expense changed or was removed. Reload and try again.");
  if (current.sourceClaimId) return fail("Expenses created from an approved claim are locked.");

  // Remove by position: mark the element, then pull the marker (a two-step MongoDB idiom).
  const marker = `__delete_${randomUUID()}`;
  const marked = await db.collection(C.projects).updateOne({ _id: id, [`expenses.${index}.title`]: expectedTitle }, { $set: { [`expenses.${index}`]: marker } });
  if (marked.matchedCount === 0) return fail("This expense changed or was removed. Reload and try again.");
  await db.collection(C.projects).updateOne({ _id: id }, { $pull: { expenses: marker } } as never);
  refresh(projectId);
  return { ok: true };
}

export async function updateGeneralExpense(expenseId: string, input: unknown): Promise<Result> {
  if (!(await admin())) return fail("Only admins can edit expenses.");
  const id = oid(expenseId);
  if (!id) return fail("Expense not found.");
  const parsed = expenseEditSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form.");
  const d = parsed.data;
  const db = await getDb();
  const style = await getDecimalStyle(db);
  const current = await db.collection(C.generalExpenses).findOne({ _id: id });
  if (!current || current.title !== d.expectedTitle) return fail("This expense changed or was removed. Reload and try again.");
  if (current.sourceClaimId) return fail("Expenses created from an approved claim are locked.");

  const existingFiles = allAttachments(current.invoiceImageBase64, current.attachments);
  const files = [...d.keepAttachments.filter((i) => existingFiles[i]).map((i) => existingFiles[i]), ...d.newAttachments];
  const problem = checkFiles(files);
  if (problem) return fail(problem);
  const tax = taxFields(d.taxMode, d.taxPercent);
  await db.collection(C.generalExpenses).updateOne(
    { _id: id },
    {
      $set: {
        title: d.title,
        type: d.expenseType,
        amount: dec(d.amount, style),
        transactionDate: dateInputToStored(d.date),
        includesVat: tax.includesVat,
        taxPercent: dec(tax.taxPercent, style),
        invoiceImageBase64: null,
        attachments: files.map((f) => ({ fileName: f.fileName, contentType: f.contentType, base64: f.base64 })),
      },
    },
  );
  refresh();
  return { ok: true };
}

export async function deleteGeneralExpense(expenseId: string): Promise<Result> {
  if (!(await admin())) return fail("Only admins can delete expenses.");
  const id = oid(expenseId);
  if (!id) return fail("Expense not found.");
  const db = await getDb();
  const current = await db.collection(C.generalExpenses).findOne({ _id: id }, { projection: { sourceClaimId: 1 } });
  if (!current) return fail("Expense not found.");
  if (current.sourceClaimId) return fail("Expenses created from an approved claim are locked.");
  await db.collection(C.generalExpenses).deleteOne({ _id: id });
  refresh();
  return { ok: true };
}
