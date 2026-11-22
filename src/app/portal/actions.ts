"use server";

import { randomBytes, pbkdf2Sync } from "node:crypto";
import { revalidatePath } from "next/cache";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getCurrentUser, type CurrentUser } from "@/lib/auth";
import { C, getDb } from "@/lib/db";
import { dec, getDecimalStyle, num } from "@/lib/decimal";
import { env } from "@/lib/env";
import { dateInputToStored, EXPENSE_TYPES } from "@/lib/format";
import {
  allAttachments,
  base64Bytes,
  creditSummary,
  MAX_FILE_BYTES,
  MAX_TOTAL_BYTES,
  totalAmount,
  type AttachmentDoc,
  type ClaimDoc,
  type ProjectDoc,
  type UserDoc,
} from "@/lib/models";

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

const fail = (error: string): ActionResult => ({ ok: false, error });

async function signedIn(): Promise<CurrentUser | null> {
  return getCurrentUser();
}

// ---------- shared validation ----------

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/bmp", "application/pdf"];

const attachmentSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  contentType: z.string().refine((t) => ALLOWED_TYPES.includes(t), "Only images or PDF files can be attached."),
  base64: z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/, "A file couldn't be read."),
});

function checkAttachments(list: AttachmentDoc[]): string | null {
  let total = 0;
  for (const a of list) {
    const size = base64Bytes(a.base64);
    if (size > MAX_FILE_BYTES) return `"${a.fileName}" is larger than 3 MB.`;
    total += size;
  }
  if (total > MAX_TOTAL_BYTES) return "Attachments add up to more than 4 MB. Remove or shrink some files.";
  return null;
}

const moneyEntry = {
  title: z.string().trim().min(1, "Enter a title.").max(200),
  expenseType: z.enum(EXPENSE_TYPES),
  amount: z.coerce.number().positive("Enter an amount above zero.").max(100_000_000),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date."),
  taxMode: z.enum(["added", "included", "none"]),
  taxPercent: z.coerce.number().min(0, "Tax % can't be negative.").max(100),
  attachments: z.array(attachmentSchema).max(10, "Attach at most 10 files."),
};

function taxFields(taxMode: "added" | "included" | "none", taxPercent: number) {
  // Mirrors the desktop app's three tax modes.
  if (taxMode === "none") return { includesVat: false, taxPercent: 0 };
  return { includesVat: taxMode === "included", taxPercent };
}

// The desktop app only accepts claim dates up to today and at most five years back.
function checkDate(input: string): string | null {
  const stored = dateInputToStored(input).getTime();
  const now = Date.now();
  if (stored > now + 24 * 3600 * 1000) return "The date can't be in the future.";
  if (stored < now - 5 * 366 * 24 * 3600 * 1000) return "The date can't be more than five years ago.";
  return null;
}

// ---------- claims ----------

const claimSchema = z.object({
  ...moneyEntry,
  applyTo: z.string(), // "General" or a project id
  description: z.string().trim().max(2000).default(""),
  fundedByCredit: z.boolean().default(false),
  raisedByUserId: z.string().optional(), // admins can raise a claim for someone else
});

export async function submitClaim(input: unknown): Promise<ActionResult> {
  const me = await signedIn();
  if (!me) return fail("Your session has ended. Sign in again.");

  const parsed = claimSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form and try again.");
  const data = parsed.data;
  const dateProblem = checkDate(data.date);
  if (dateProblem) return fail(dateProblem);
  const fileProblem = checkAttachments(data.attachments);
  if (fileProblem) return fail(fileProblem);

  const db = await getDb();

  // Who the claim is for.
  let owner: Pick<UserDoc, "_id" | "fullName" | "creditGrants"> = me.doc;
  if (me.isAdmin && data.raisedByUserId && data.raisedByUserId !== me.id) {
    if (!ObjectId.isValid(data.raisedByUserId)) return fail("Choose who is raising the claim.");
    const other = await db.collection<UserDoc>(C.users).findOne({ _id: new ObjectId(data.raisedByUserId) });
    if (!other) return fail("That user no longer exists.");
    owner = other;
  }

  // General or project claim.
  let project: { id: string; name: string } | null = null;
  if (data.applyTo !== "General") {
    if (!ObjectId.isValid(data.applyTo)) return fail("Choose a project.");
    const p = await db.collection<ProjectDoc>(C.projects).findOne({ _id: new ObjectId(data.applyTo) }, { projection: { name: 1 } });
    if (!p) return fail("That project no longer exists.");
    project = { id: p._id.toHexString(), name: p.name };
  }

  const tax = taxFields(data.taxMode, data.taxPercent);
  if (data.fundedByCredit) {
    const claims = await db.collection<ClaimDoc>(C.claims).find({ userId: owner._id.toHexString(), fundedByCredit: true }).toArray();
    const { available } = creditSummary(owner, claims);
    const total = totalAmount({ amount: data.amount, ...tax });
    if (total > available + 0.01) {
      return fail(`This claim's total including tax is more than the available credit (OMR ${available.toFixed(3).replace(/\.?0+$/, "")}).`);
    }
  }

  const style = await getDecimalStyle(db);
  const now = new Date();
  // Exactly the fields the desktop app's ClaimDocument writes.
  const doc = {
    userId: owner._id.toHexString(),
    userName: owner.fullName,
    claimType: project ? "Project" : "General",
    projectId: project?.id ?? null,
    projectName: project?.name ?? "",
    expenseType: data.expenseType,
    title: data.title,
    description: data.description,
    amount: dec(data.amount, style),
    claimDate: dateInputToStored(data.date),
    status: "Pending",
    createdAt: now,
    decidedAt: null,
    proofImageBase64: null,
    attachments: data.attachments,
    includesVat: tax.includesVat,
    taxPercent: dec(tax.taxPercent, style),
    fundedByCredit: data.fundedByCredit,
  };
  const result = await db.collection(C.claims).insertOne(doc);

  revalidatePath("/portal", "layout");
  return { ok: true, id: result.insertedId.toHexString() };
}

export async function deleteClaim(claimId: string): Promise<ActionResult> {
  const me = await signedIn();
  if (!me) return fail("Your session has ended. Sign in again.");
  if (!ObjectId.isValid(claimId)) return fail("Claim not found.");
  const db = await getDb();
  // Only pending claims can be deleted - by their owner or by an admin (same rule as the desktop app).
  const filter = me.isAdmin
    ? { _id: new ObjectId(claimId), status: { $regex: "^pending$", $options: "i" } }
    : { _id: new ObjectId(claimId), userId: me.id, status: { $regex: "^pending$", $options: "i" } };
  const result = await db.collection(C.claims).deleteOne(filter);
  if (result.deletedCount === 0) return fail("Only pending claims can be deleted.");
  revalidatePath("/portal", "layout");
  return { ok: true };
}

export async function decideClaim(claimId: string, decision: "approve" | "reject"): Promise<ActionResult> {
  const me = await signedIn();
  if (!me?.isAdmin) return fail("Only admins can approve or reject claims.");
  if (!ObjectId.isValid(claimId)) return fail("Claim not found.");
  const db = await getDb();
  const claims = db.collection<ClaimDoc>(C.claims);
  const id = new ObjectId(claimId);
  const decidedAt = new Date();

  // Flip the status atomically first so two admins can't approve the same claim twice.
  const claim = await claims.findOneAndUpdate(
    { _id: id, status: { $regex: "^pending$", $options: "i" } },
    { $set: { status: decision === "approve" ? "Approved" : "Rejected", decidedAt } },
    { returnDocument: "before" },
  );
  if (!claim) return fail("This claim has already been decided.");

  if (decision === "approve") {
    try {
      const style = await getDecimalStyle(db);
      const files = allAttachments(claim.proofImageBase64, claim.attachments).map((a) => ({
        fileName: a.fileName,
        contentType: a.contentType,
        base64: a.base64,
      }));
      const expenseType = claim.expenseType?.trim() ? claim.expenseType : "User Claim";
      const common = {
        title: claim.title,
        type: expenseType,
        amount: dec(num(claim.amount), style),
        transactionDate: claim.claimDate,
        sourceClaimId: claimId,
        includesVat: Boolean(claim.includesVat),
        taxPercent: dec(num(claim.taxPercent), style),
        invoiceImageBase64: null,
        attachments: files,
        addedByUserName: claim.userName,
      };
      const isProject = (claim.claimType ?? "").toLowerCase() === "project";
      if (isProject && claim.projectId && ObjectId.isValid(claim.projectId)) {
        // Same ProjectExpense fields the desktop app posts on approval.
        await db.collection(C.projects).updateOne(
          { _id: new ObjectId(claim.projectId) },
          { $push: { expenses: { ...common, sourceSubcontractorClauseId: null } } } as never,
        );
      } else if (!isProject) {
        await db.collection(C.generalExpenses).insertOne(common);
      }
    } catch (error) {
      // Couldn't post the expense - put the claim back to pending, like the desktop app does.
      await claims.updateOne({ _id: id }, { $set: { status: "Pending", decidedAt: null } });
      console.error("approve failed", error);
      return fail("The claim couldn't be approved. Please try again.");
    }
  }

  revalidatePath("/portal", "layout");
  return { ok: true };
}

// ---------- expenses (admin) ----------

const expenseSchema = z.object({ ...moneyEntry, projectId: z.string().optional() });

export async function addExpense(input: unknown): Promise<ActionResult> {
  const me = await signedIn();
  if (!me?.isAdmin) return fail("Only admins can add expenses.");
  const parsed = expenseSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form and try again.");
  const data = parsed.data;
  const dateProblem = checkDate(data.date);
  if (dateProblem) return fail(dateProblem);
  const fileProblem = checkAttachments(data.attachments);
  if (fileProblem) return fail(fileProblem);

  const db = await getDb();
  const style = await getDecimalStyle(db);
  const tax = taxFields(data.taxMode, data.taxPercent);
  const common = {
    type: data.expenseType,
    title: data.title,
    amount: dec(data.amount, style),
    transactionDate: dateInputToStored(data.date),
    sourceClaimId: null,
    includesVat: tax.includesVat,
    taxPercent: dec(tax.taxPercent, style),
    invoiceImageBase64: null,
    attachments: data.attachments,
    addedByUserName: me.fullName,
  };

  if (data.projectId) {
    if (!ObjectId.isValid(data.projectId)) return fail("Project not found.");
    const result = await db.collection(C.projects).updateOne(
      { _id: new ObjectId(data.projectId) },
      { $push: { expenses: { ...common, sourceSubcontractorClauseId: null } } } as never,
    );
    if (result.matchedCount === 0) return fail("Project not found.");
  } else {
    await db.collection(C.generalExpenses).insertOne(common);
  }

  revalidatePath("/portal", "layout");
  return { ok: true };
}

// ---------- users (admin) ----------

// Same format as the desktop app: "pbkdf2$<iterations>$<salt b64>$<hash b64>", so accounts
// created here can also sign in to the desktop app with this password.
function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(password, salt, 100_000, 32, "sha256");
  return `pbkdf2$100000$${salt.toString("base64")}$${hash.toString("base64")}`;
}

const userSchema = z.object({
  fullName: z.string().trim().min(2, "Enter the full name.").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email."),
  role: z.enum(["Admin", "User"]),
  employeeId: z.string().optional(),
  password: z.string().max(200).optional(),
});

export async function createUser(input: unknown): Promise<ActionResult> {
  const me = await signedIn();
  if (!me?.isAdmin) return fail("Only admins can add users.");
  const parsed = userSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form and try again.");
  const data = parsed.data;
  if (!data.email.endsWith(`@${env.allowedDomain}`)) return fail(`Only @${env.allowedDomain} emails can be added.`);
  if (data.password && data.password.length < 8) return fail("The desktop password must be at least 8 characters.");

  const db = await getDb();
  const users = db.collection<UserDoc>(C.users);
  const escaped = data.email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (await users.findOne({ email: { $regex: `^\\s*${escaped}\\s*$`, $options: "i" } })) {
    return fail("An account with this email already exists.");
  }

  let employeeName = "";
  let employeeId: string | null = null;
  if (data.employeeId) {
    const link = await checkEmployeeLink(data.employeeId, null);
    if ("error" in link) return fail(link.error);
    employeeId = data.employeeId;
    employeeName = link.name;
  }

  // Exactly the fields of the desktop app's UserDocument. Without a desktop password the
  // account gets a random one nobody knows, so it can only sign in through the portal.
  await db.collection(C.users).insertOne({
    fullName: data.fullName,
    email: data.email,
    passwordHash: hashPassword(data.password || randomBytes(24).toString("base64")),
    role: data.role,
    employeeId,
    employeeName,
    creditGrants: [],
  });

  revalidatePath("/portal/users");
  return { ok: true };
}

export async function updateUser(userId: string, changes: { role?: "Admin" | "User"; employeeId?: string | null }): Promise<ActionResult> {
  const me = await signedIn();
  if (!me?.isAdmin) return fail("Only admins can change users.");
  if (!ObjectId.isValid(userId)) return fail("User not found.");
  const db = await getDb();
  const set: Record<string, unknown> = {};

  if (changes.role) {
    if (userId === me.id && changes.role !== "Admin") return fail("You can't remove your own admin access.");
    set.role = changes.role === "Admin" ? "Admin" : "User";
  }
  if (changes.employeeId !== undefined) {
    if (changes.employeeId) {
      const link = await checkEmployeeLink(changes.employeeId, userId);
      if ("error" in link) return fail(link.error);
      set.employeeId = changes.employeeId;
      set.employeeName = link.name;
    } else {
      set.employeeId = null;
      set.employeeName = "";
    }
  }
  if (Object.keys(set).length === 0) return { ok: true };

  const result = await db.collection(C.users).updateOne({ _id: new ObjectId(userId) }, { $set: set });
  if (result.matchedCount === 0) return fail("User not found.");
  revalidatePath("/portal/users");
  return { ok: true };
}

// Each employee can be linked to one user only, and disabled employees can't be linked
// (the desktop app leaves them off its picker).
async function checkEmployeeLink(employeeId: string, exceptUserId: string | null): Promise<{ name: string } | { error: string }> {
  if (!ObjectId.isValid(employeeId)) return { error: "Employee not found." };
  const db = await getDb();
  const emp = await db.collection(C.employees).findOne({ _id: new ObjectId(employeeId) }, { projection: { name: 1, status: 1 } });
  if (!emp) return { error: "Employee not found." };
  const other = await db.collection<UserDoc>(C.users).findOne({ employeeId, ...(exceptUserId && ObjectId.isValid(exceptUserId) ? { _id: { $ne: new ObjectId(exceptUserId) } } : {}) });
  if (other) return { error: `${emp.name} is already linked to ${other.fullName || other.email}.` };
  if (String(emp.status ?? "").toLowerCase() === "disabled") {
    // Keeping an existing link to someone who has since left is fine; a new link isn't.
    const self = exceptUserId && ObjectId.isValid(exceptUserId) ? await db.collection<UserDoc>(C.users).findOne({ _id: new ObjectId(exceptUserId) }, { projection: { employeeId: 1 } }) : null;
    if (self?.employeeId !== employeeId) return { error: `${emp.name} is disabled and can't be linked.` };
  }
  return { name: String(emp.name ?? "") };
}

// ---------- credit & accounts (admin) ----------

export async function grantCredit(userId: string, amount: number, note: string): Promise<ActionResult> {
  const me = await signedIn();
  if (!me?.isAdmin) return fail("Only admins can grant credit.");
  if (!ObjectId.isValid(userId)) return fail("User not found.");
  if (!(Number.isFinite(amount) && amount > 0 && amount <= 100_000_000)) return fail("Enter a valid credit amount greater than zero.");
  const db = await getDb();
  const style = await getDecimalStyle(db);
  // Exactly the desktop app's UserCreditGrant fields.
  const grant = { amount: dec(amount, style), note: String(note ?? "").trim().slice(0, 500), grantedAt: new Date(), grantedBy: me.fullName };
  const result = await db.collection(C.users).updateOne({ _id: new ObjectId(userId) }, { $push: { creditGrants: grant } } as never);
  if (result.matchedCount === 0) return fail("User not found.");
  revalidatePath("/portal", "layout");
  return { ok: true };
}

export async function deleteUser(userId: string, confirmEmail: string): Promise<ActionResult> {
  const me = await signedIn();
  if (!me?.isAdmin) return fail("Only admins can delete users.");
  if (!ObjectId.isValid(userId)) return fail("User not found.");
  if (userId === me.id) return fail("You can't delete your own account.");
  const db = await getDb();
  const user = await db.collection<UserDoc>(C.users).findOne({ _id: new ObjectId(userId) }, { projection: { email: 1 } });
  if (!user) return fail("User not found.");
  if (confirmEmail.trim().toLowerCase() !== (user.email ?? "").trim().toLowerCase()) return fail("Type the user's email exactly to confirm.");
  // Their claims stay, as in the desktop app (they're part of the expense history).
  await db.collection(C.users).deleteOne({ _id: user._id });
  revalidatePath("/portal", "layout");
  return { ok: true };
}

// ---------- edit a pending claim (by the person who raised it) ----------

const claimEditSchema = z.object({
  ...moneyEntry,
  applyTo: z.string(),
  description: z.string().trim().max(2000).default(""),
  fundedByCredit: z.boolean().default(false),
  keepAttachments: z.array(z.number().int().min(0)).default([]),
});

export async function updateClaim(claimId: string, input: unknown): Promise<ActionResult> {
  const me = await signedIn();
  if (!me) return fail("Your session has ended. Sign in again.");
  if (!ObjectId.isValid(claimId)) return fail("Claim not found.");
  const parsed = claimEditSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form and try again.");
  const data = parsed.data;
  const dateProblem = checkDate(data.date);
  if (dateProblem) return fail(dateProblem);

  const db = await getDb();
  const claims = db.collection<ClaimDoc>(C.claims);
  const claim = await claims.findOne({ _id: new ObjectId(claimId) });
  // Same rule as the desktop app: only your own claim, and only while it's pending.
  if (!claim || claim.userId !== me.id) return fail("Only the person who raised a claim can edit it.");
  if ((claim.status ?? "").toLowerCase() !== "pending") return fail("Only pending claims can be edited.");

  const existingFiles = allAttachments(claim.proofImageBase64, claim.attachments);
  const files = [...data.keepAttachments.filter((i) => existingFiles[i]).map((i) => existingFiles[i]), ...data.attachments].map((f) => ({
    fileName: f.fileName,
    contentType: f.contentType,
    base64: f.base64,
  }));
  const fileProblem = checkAttachments(files);
  if (fileProblem) return fail(fileProblem);

  let project: { id: string; name: string } | null = null;
  if (data.applyTo !== "General") {
    if (!ObjectId.isValid(data.applyTo)) return fail("Choose a project.");
    const p = await db.collection<ProjectDoc>(C.projects).findOne({ _id: new ObjectId(data.applyTo) }, { projection: { name: 1 } });
    if (!p) return fail("That project no longer exists.");
    project = { id: p._id.toHexString(), name: p.name };
  }

  const tax = taxFields(data.taxMode, data.taxPercent);
  if (data.fundedByCredit) {
    const mine = await claims.find({ userId: me.id, fundedByCredit: true }).toArray();
    let { available } = creditSummary(me.doc, mine);
    // This claim's own amount is already reserved against the balance - add it back.
    if (claim.fundedByCredit) available += totalAmount(claim);
    if (totalAmount({ amount: data.amount, ...tax }) > available + 0.01) {
      return fail(`This claim's total including tax is more than your available credit (OMR ${available.toFixed(3).replace(/\.?0+$/, "")}).`);
    }
  }

  const style = await getDecimalStyle(db);
  const result = await claims.updateOne(
    { _id: claim._id, userId: me.id, status: claim.status },
    {
      $set: {
        claimType: project ? "Project" : "General",
        projectId: project?.id ?? null,
        projectName: project?.name ?? "",
        expenseType: data.expenseType,
        title: data.title,
        description: data.description,
        amount: dec(data.amount, style),
        claimDate: dateInputToStored(data.date),
        includesVat: tax.includesVat,
        taxPercent: dec(tax.taxPercent, style),
        attachments: files,
        proofImageBase64: null, // legacy image is folded into the list, as in the desktop app
        fundedByCredit: data.fundedByCredit,
      },
    },
  );
  if (result.matchedCount === 0) return fail("This claim was just decided by an admin. Reload to see it.");
  revalidatePath("/portal", "layout");
  return { ok: true, id: claimId };
}
