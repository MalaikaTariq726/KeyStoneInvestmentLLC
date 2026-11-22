import "server-only";
import { ObjectId } from "mongodb";
import { C, getDb } from "./db";
import { num } from "./decimal";
import { VAT_RATE } from "./models";

// Subcontractors and their per-project agreements, as the desktop app stores them.

export interface SubcontractorDoc {
  _id: ObjectId;
  name: string;
  tradeSpecialty: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  status: string; // "Active" | "Inactive"
  createdAt: Date;
}

export interface SubClauseDoc {
  id: string;
  title: string;
  paymentType?: string;
  percentage: unknown;
  paymentAmount: unknown;
  status: string;
  closedAt?: Date;
}

export interface AgreementDoc {
  subcontractorId: string;
  subcontractorName: string;
  agreementValue: unknown;
  clauses?: SubClauseDoc[];
  status: string;
  createdAt: Date;
}

export const SUB_STAGE_STATUSES = ["Pending", "Processing", "Paid"] as const;

const included = (s: string) => ["processed", "paid", "payed", "closed"].includes((s ?? "").toLowerCase());

// SubcontractorClause.SettledAmount: the full stage amount once Paid, otherwise nothing.
export const subClauseSettled = (c: SubClauseDoc) => (included(c.status) ? num(c.paymentAmount) : 0);
export const agreementPaid = (a: AgreementDoc) => (a.clauses ?? []).reduce((s, c) => s + subClauseSettled(c), 0);
export const agreementRemaining = (a: AgreementDoc) => Math.max(0, num(a.agreementValue) - agreementPaid(a));
export const agreementWithTax = (a: AgreementDoc) => num(a.agreementValue) * (1 + VAT_RATE);
export const isActiveSub = (s: Pick<SubcontractorDoc, "status">) => (s.status ?? "").toLowerCase() === "active";

export async function listSubcontractors(): Promise<SubcontractorDoc[]> {
  const db = await getDb();
  const rows = await db.collection<SubcontractorDoc>(C.subcontractors).find({}).toArray();
  return rows.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
}

export async function getSubcontractor(id: string): Promise<SubcontractorDoc | null> {
  if (!ObjectId.isValid(id)) return null;
  const db = await getDb();
  return db.collection<SubcontractorDoc>(C.subcontractors).findOne({ _id: new ObjectId(id) });
}

// Every agreement across projects, with the project it belongs to.
export async function listAgreements(): Promise<Array<{ projectId: string; projectName: string; projectStatus: string; agreement: AgreementDoc }>> {
  const db = await getDb();
  const rows = await db
    .collection(C.projects)
    .find({ "subcontractorAgreements.0": { $exists: true } }, { projection: { name: 1, status: 1, subcontractorAgreements: 1 } })
    .toArray();
  return rows.flatMap((p) =>
    ((p.subcontractorAgreements ?? []) as AgreementDoc[]).map((agreement) => ({
      projectId: p._id.toHexString(),
      projectName: String(p.name ?? ""),
      projectStatus: String(p.status ?? ""),
      agreement,
    })),
  );
}
