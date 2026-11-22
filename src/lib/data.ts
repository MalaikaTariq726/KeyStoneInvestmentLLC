import "server-only";
import { ObjectId, type Document } from "mongodb";
import { C, getDb } from "./db";
import type { ClaimDoc, EmployeeDoc, GeneralExpenseDoc, ProjectDoc, ProjectExpenseDoc, UserDoc } from "./models";
import type { AgreementDoc } from "./subcontractors";

// Read helpers. List views never pull attachment file contents (base64 can be megabytes);
// they get an attachment count instead, and files are streamed by /api/files on demand.

const attachmentCount = (legacyField: string, listField: string) => ({
  $add: [
    { $size: { $ifNull: [`$${listField}`, []] } },
    { $cond: [{ $gt: [{ $strLenCP: { $ifNull: [`$${legacyField}`, ""] } }, 0] }, 1, 0] },
  ],
});

export type ClaimLite = Omit<ClaimDoc, "attachments" | "proofImageBase64"> & {
  attachmentCount: number;
  attachmentNames: string[];
};

export async function listClaims(match: Document = {}): Promise<ClaimLite[]> {
  const db = await getDb();
  return db
    .collection(C.claims)
    .aggregate<ClaimLite>([
      { $match: match },
      { $sort: { createdAt: -1 } },
      {
        $addFields: {
          attachmentCount: attachmentCount("proofImageBase64", "attachments"),
          attachmentNames: { $map: { input: { $ifNull: ["$attachments", []] }, as: "a", in: "$$a.fileName" } },
        },
      },
      { $project: { attachments: 0, proofImageBase64: 0 } },
    ])
    .toArray();
}

export async function getClaim(id: string): Promise<ClaimLite | null> {
  if (!ObjectId.isValid(id)) return null;
  const [claim] = await listClaims({ _id: new ObjectId(id) });
  return claim ?? null;
}

// Just the fields the credit calculation needs, for every claim.
export async function listClaimsForCredit(): Promise<ClaimDoc[]> {
  const db = await getDb();
  return db
    .collection<ClaimDoc>(C.claims)
    .find({ fundedByCredit: true }, { projection: { userId: 1, status: 1, amount: 1, includesVat: 1, taxPercent: 1, fundedByCredit: 1 } })
    .toArray();
}

export type ProjectExpenseLite = Omit<ProjectExpenseDoc, "attachments" | "invoiceImageBase64"> & { attachmentCount: number; attachmentNames: string[]; index: number };
export type ProjectLite = Omit<ProjectDoc, "expenses"> & { expenses: ProjectExpenseLite[]; subcontractorAgreements?: AgreementDoc[] };

const projectPipeline = (match: Document): Document[] => [
  { $match: match },
  {
    $project: {
      clientName: 1,
      name: 1,
      description: 1,
      contractValue: 1,
      natureOfProject: 1,
      status: 1,
      createdAt: 1,
      clauses: 1,
      subcontractorAgreements: 1,
      expenses: {
        $map: {
          input: { $range: [0, { $size: { $ifNull: ["$expenses", []] } }] },
          as: "i",
          in: {
            $let: {
              vars: { e: { $arrayElemAt: ["$expenses", "$$i"] } },
              in: {
                index: "$$i",
                type: "$$e.type",
                title: "$$e.title",
                amount: "$$e.amount",
                transactionDate: "$$e.transactionDate",
                sourceClaimId: "$$e.sourceClaimId",
                includesVat: "$$e.includesVat",
                taxPercent: "$$e.taxPercent",
                addedByUserName: "$$e.addedByUserName",
                attachmentNames: { $map: { input: { $ifNull: ["$$e.attachments", []] }, as: "a", in: "$$a.fileName" } },
                attachmentCount: {
                  $add: [
                    { $size: { $ifNull: ["$$e.attachments", []] } },
                    { $cond: [{ $gt: [{ $strLenCP: { $ifNull: ["$$e.invoiceImageBase64", ""] } }, 0] }, 1, 0] },
                  ],
                },
              },
            },
          },
        },
      },
    },
  },
];

export async function listProjects(): Promise<ProjectLite[]> {
  const db = await getDb();
  const projects = await db.collection(C.projects).aggregate<ProjectLite>(projectPipeline({})).toArray();
  return projects.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getProject(id: string): Promise<ProjectLite | null> {
  if (!ObjectId.isValid(id)) return null;
  const db = await getDb();
  const [project] = await db.collection(C.projects).aggregate<ProjectLite>(projectPipeline({ _id: new ObjectId(id) })).toArray();
  return project ?? null;
}

export async function listProjectNames(): Promise<Array<{ id: string; name: string }>> {
  const db = await getDb();
  const rows = await db.collection(C.projects).find({}, { projection: { name: 1 } }).toArray();
  return rows.map((p) => ({ id: p._id.toHexString(), name: String(p.name ?? "") })).sort((a, b) => a.name.localeCompare(b.name));
}

export interface InvoiceLite {
  id: string;
  invoiceNumber: string;
  type: string;
  summary: string;
  subtotal: unknown;
  tax: unknown;
  total: unknown;
  generatedAt: Date;
  generatedBy: string;
}

// Invoice history without the stored HTML (each saved invoice carries its full page).
export async function listInvoices(projectId: string): Promise<InvoiceLite[]> {
  if (!ObjectId.isValid(projectId)) return [];
  const db = await getDb();
  const [row] = await db
    .collection(C.projects)
    .aggregate<{ invoices: InvoiceLite[] }>([
      { $match: { _id: new ObjectId(projectId) } },
      {
        $project: {
          invoices: {
            $map: {
              input: { $ifNull: ["$invoiceHistory", []] },
              as: "r",
              in: {
                id: "$$r.id",
                invoiceNumber: "$$r.invoiceNumber",
                type: "$$r.type",
                summary: "$$r.summary",
                subtotal: "$$r.subtotal",
                tax: "$$r.tax",
                total: "$$r.total",
                generatedAt: "$$r.generatedAt",
                generatedBy: "$$r.generatedBy",
              },
            },
          },
        },
      },
    ])
    .toArray();
  return row?.invoices ?? [];
}

export async function getInvoiceHtml(projectId: string, invoiceId: string): Promise<{ html: string; invoiceNumber: string } | null> {
  if (!ObjectId.isValid(projectId) || !invoiceId) return null;
  const db = await getDb();
  const [row] = await db
    .collection(C.projects)
    .aggregate<{ r: { html: string; invoiceNumber: string } | null }>([
      { $match: { _id: new ObjectId(projectId) } },
      { $project: { r: { $first: { $filter: { input: { $ifNull: ["$invoiceHistory", []] }, as: "x", cond: { $eq: ["$$x.id", invoiceId] } } } } } },
    ])
    .toArray();
  return row?.r ? { html: row.r.html ?? "", invoiceNumber: row.r.invoiceNumber ?? "" } : null;
}

export type GeneralExpenseLite = Omit<GeneralExpenseDoc, "attachments" | "invoiceImageBase64"> & { attachmentCount: number; attachmentNames: string[] };

export async function getGeneralExpense(id: string): Promise<GeneralExpenseLite | null> {
  if (!ObjectId.isValid(id)) return null;
  const rows = await listGeneralExpensesMatching({ _id: new ObjectId(id) });
  return rows[0] ?? null;
}

async function listGeneralExpensesMatching(match: Document): Promise<GeneralExpenseLite[]> {
  const db = await getDb();
  return db
    .collection(C.generalExpenses)
    .aggregate<GeneralExpenseLite>([
      { $match: match },
      { $sort: { transactionDate: -1 } },
      {
        $addFields: {
          attachmentCount: attachmentCount("invoiceImageBase64", "attachments"),
          attachmentNames: { $map: { input: { $ifNull: ["$attachments", []] }, as: "a", in: "$$a.fileName" } },
        },
      },
      { $project: { attachments: 0, invoiceImageBase64: 0 } },
    ])
    .toArray();
}

export async function listGeneralExpenses(): Promise<GeneralExpenseLite[]> {
  const db = await getDb();
  return db
    .collection(C.generalExpenses)
    .aggregate<GeneralExpenseLite>([
      { $sort: { transactionDate: -1 } },
      {
        $addFields: {
          attachmentCount: attachmentCount("invoiceImageBase64", "attachments"),
          attachmentNames: { $map: { input: { $ifNull: ["$attachments", []] }, as: "a", in: "$$a.fileName" } },
        },
      },
      { $project: { attachments: 0, invoiceImageBase64: 0 } },
    ])
    .toArray();
}

export type UserLite = Omit<UserDoc, "passwordHash">;

export async function listUsers(): Promise<UserLite[]> {
  const db = await getDb();
  const users = await db.collection<UserDoc>(C.users).find({}, { projection: { passwordHash: 0 } }).toArray();
  return users.sort((a, b) => (a.fullName || a.email).localeCompare(b.fullName || b.email));
}

export async function listEmployees(): Promise<EmployeeDoc[]> {
  const db = await getDb();
  const rows = await db.collection<EmployeeDoc>(C.employees).find({}, { projection: { name: 1, designation: 1, status: 1 } }).toArray();
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}
