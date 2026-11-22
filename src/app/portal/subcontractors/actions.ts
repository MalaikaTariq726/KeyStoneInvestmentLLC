"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { C, getDb } from "@/lib/db";
import { dec, getDecimalStyle, num } from "@/lib/decimal";
import { clauseAmountFor, effectivePercentage, MIN_DATE } from "@/lib/projects";
import { isActiveSub, subClauseSettled, type AgreementDoc, type SubClauseDoc, type SubcontractorDoc } from "@/lib/subcontractors";

export type Result = { ok: true; id?: string } | { ok: false; error: string };
const fail = (error: string): Result => ({ ok: false, error });

async function admin() {
  const me = await getCurrentUser();
  return me?.isAdmin ? me : null;
}

const refresh = () => revalidatePath("/portal", "layout");

// ---------------- directory ----------------

const subSchema = z.object({
  name: z.string().trim().min(1, "Enter a subcontractor name and trade / specialty.").max(200),
  tradeSpecialty: z.string().trim().min(1, "Enter a subcontractor name and trade / specialty.").max(200),
  contactPerson: z.string().trim().max(200).default(""),
  phone: z
    .string()
    .trim()
    .max(50)
    .default("")
    .refine((p) => !/\p{L}/u.test(p), "Phone number cannot contain letters."),
  email: z.union([z.literal(""), z.string().trim().email("Enter a valid email, or leave it empty.")]).default(""),
  address: z.string().trim().max(500).default(""),
  notes: z.string().trim().max(2000).default(""),
  status: z.enum(["Active", "Inactive"]),
});

export async function saveSubcontractor(id: string | null, input: unknown): Promise<Result> {
  if (!(await admin())) return fail("Only admins can manage subcontractors.");
  const parsed = subSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form.");
  const d = parsed.data;
  const db = await getDb();

  if (!id) {
    const result = await db.collection(C.subcontractors).insertOne({ ...d, createdAt: new Date() });
    refresh();
    return { ok: true, id: result.insertedId.toHexString() };
  }
  if (!ObjectId.isValid(id)) return fail("Subcontractor not found.");
  const existing = await db.collection<SubcontractorDoc>(C.subcontractors).findOne({ _id: new ObjectId(id) });
  if (!existing) return fail("Subcontractor not found.");
  await db.collection(C.subcontractors).updateOne({ _id: existing._id }, { $set: d });
  // Agreements keep a copy of the name (as in the desktop app) - keep them current.
  if (existing.name !== d.name) {
    await db
      .collection(C.projects)
      .updateMany({ "subcontractorAgreements.subcontractorId": id }, { $set: { "subcontractorAgreements.$[a].subcontractorName": d.name } }, { arrayFilters: [{ "a.subcontractorId": id }] });
  }
  refresh();
  return { ok: true, id };
}

export async function deleteSubcontractor(id: string, confirmName: string): Promise<Result> {
  if (!(await admin())) return fail("Only admins can delete subcontractors.");
  if (!ObjectId.isValid(id)) return fail("Subcontractor not found.");
  const db = await getDb();
  const existing = await db.collection<SubcontractorDoc>(C.subcontractors).findOne({ _id: new ObjectId(id) });
  if (!existing) return fail("Subcontractor not found.");
  if (confirmName.trim() !== existing.name.trim()) return fail("Type the subcontractor's name exactly to confirm.");
  // Like the desktop app, agreements already on projects stay (with the stored name).
  await db.collection(C.subcontractors).deleteOne({ _id: existing._id });
  refresh();
  return { ok: true };
}

// ---------------- agreements ----------------

export async function addAgreement(projectId: string, subcontractorId: string, value: number): Promise<Result> {
  if (!(await admin())) return fail("Only admins can add agreements.");
  if (!ObjectId.isValid(projectId) || !ObjectId.isValid(subcontractorId)) return fail("Choose a subcontractor and enter a valid agreement value.");
  if (!(Number.isFinite(value) && value > 0)) return fail("Choose a subcontractor and enter a valid agreement value.");
  const db = await getDb();
  const style = await getDecimalStyle(db);
  const sub = await db.collection<SubcontractorDoc>(C.subcontractors).findOne({ _id: new ObjectId(subcontractorId) });
  if (!sub || !isActiveSub(sub)) return fail("Choose an active subcontractor.");
  const project = await db.collection(C.projects).findOne({ _id: new ObjectId(projectId) }, { projection: { contractValue: 1, subcontractorAgreements: 1 } });
  if (!project) return fail("Project not found.");
  const agreements = (project.subcontractorAgreements ?? []) as AgreementDoc[];
  if (agreements.some((a) => a.subcontractorId === subcontractorId)) return fail("This subcontractor already has an agreement on this project.");

  // Commitments to subcontractors as a whole can't exceed what the project is worth.
  const already = agreements.reduce((s, a) => s + num(a.agreementValue), 0);
  const contract = num(project.contractValue);
  if (already + value > contract + 0.01) {
    const left = Math.max(0, contract - already);
    return fail(`Agreement value cannot exceed the project's contract value. The contract is OMR ${Math.round(contract).toLocaleString("en-US")}, OMR ${Math.round(already).toLocaleString("en-US")} is already committed to other subcontractors, leaving OMR ${Math.round(left).toLocaleString("en-US")} available.`);
  }

  // Exactly the desktop app's SubcontractorAgreement fields.
  const result = await db.collection(C.projects).updateOne(
    { _id: project._id, "subcontractorAgreements.subcontractorId": { $ne: subcontractorId } },
    { $push: { subcontractorAgreements: { subcontractorId, subcontractorName: sub.name, agreementValue: dec(value, style), clauses: [], status: "Active", createdAt: new Date() } } } as never,
  );
  if (result.matchedCount === 0) return fail("This subcontractor already has an agreement on this project.");
  refresh();
  return { ok: true };
}

export async function deleteAgreement(projectId: string, subcontractorId: string): Promise<Result> {
  if (!(await admin())) return fail("Only admins can remove agreements.");
  if (!ObjectId.isValid(projectId)) return fail("Project not found.");
  const db = await getDb();
  // Expenses already posted for paid stages stay on the project, as in the desktop app.
  await db.collection(C.projects).updateOne({ _id: new ObjectId(projectId) }, { $pull: { subcontractorAgreements: { subcontractorId } } } as never);
  refresh();
  return { ok: true };
}

const stagesSchema = z.object({
  stages: z
    .array(
      z.object({
        id: z.string().optional(),
        title: z.string().trim().min(1, "Each selected stage needs a title.").max(500),
        paymentType: z.enum(["Percentage", "Amount"]),
        value: z.coerce.number().min(0, "Each selected stage needs a valid non-negative value."),
        status: z.enum(["Pending", "Processing", "Paid"]),
      }),
    )
    .min(1, "Select or add at least one stage.")
    .max(100),
});

// Save an agreement's stages. A stage newly marked Paid posts its amount (plus 5% tax) as a
// "Subcontractor Payment" expense on the project - the same rule as the desktop app.
export async function saveAgreementStages(projectId: string, subcontractorId: string, input: unknown): Promise<Result> {
  const me = await admin();
  if (!me) return fail("Only admins can edit agreement stages.");
  if (!ObjectId.isValid(projectId)) return fail("Project not found.");
  const parsed = stagesSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the stages.");

  const db = await getDb();
  const style = await getDecimalStyle(db);
  const project = await db.collection(C.projects).findOne({ _id: new ObjectId(projectId) }, { projection: { subcontractorAgreements: 1 } });
  const agreements = (project?.subcontractorAgreements ?? []) as AgreementDoc[];
  const index = agreements.findIndex((a) => a.subcontractorId === subcontractorId);
  if (!project || index < 0) return fail("Agreement not found.");
  const agreement = agreements[index];
  const value = num(agreement.agreementValue);

  const total = parsed.data.stages.reduce((s, st) => s + clauseAmountFor(st.paymentType, st.value, value), 0);
  if (Math.abs(total - value) > 0.01) {
    return fail(`Selected stages must add up to the agreement value (OMR ${value.toFixed(3)}). Current total is OMR ${total.toFixed(3)}.`);
  }

  const existing = agreement.clauses ?? [];
  const expenses: Record<string, unknown>[] = [];
  const clauses = parsed.data.stages.map((st) => {
    const id = st.id && existing.some((c) => c.id === st.id) ? st.id : randomUUID();
    const prior = existing.find((c) => c.id === id);
    const paymentAmount = clauseAmountFor(st.paymentType, st.value, value);
    const clause: SubClauseDoc = {
      id,
      title: st.title,
      paymentType: st.paymentType,
      percentage: st.paymentType === "Amount" ? effectivePercentage(st.value, value) : st.value,
      paymentAmount,
      status: st.status,
      closedAt: MIN_DATE,
    };
    const newlySettled = subClauseSettled(clause) - (prior ? subClauseSettled(prior) : 0);
    if (newlySettled > 0.01) {
      // ProjectExpense defaults in the desktop app: 5% tax added on top.
      expenses.push({
        type: "Subcontractor Payment",
        title: `${agreement.subcontractorName} - ${st.title}`,
        amount: dec(newlySettled, style),
        transactionDate: new Date(),
        sourceClaimId: null,
        sourceSubcontractorClauseId: id,
        includesVat: false,
        taxPercent: dec(5, style),
        invoiceImageBase64: null,
        attachments: [],
        addedByUserName: me.fullName,
      });
    }
    return {
      id: clause.id,
      title: clause.title,
      paymentType: clause.paymentType,
      percentage: dec(num(clause.percentage), style),
      paymentAmount: dec(paymentAmount, style),
      status: clause.status,
      closedAt: MIN_DATE,
    };
  });

  const update: Record<string, unknown> = { $set: { [`subcontractorAgreements.${index}.clauses`]: clauses } };
  if (expenses.length) update.$push = { expenses: { $each: expenses } };
  const result = await db
    .collection(C.projects)
    .updateOne({ _id: project._id, [`subcontractorAgreements.${index}.subcontractorId`]: subcontractorId }, update as never);
  if (result.matchedCount === 0) return fail("The agreements changed while you were editing. Reload and try again.");
  refresh();
  return { ok: true };
}
