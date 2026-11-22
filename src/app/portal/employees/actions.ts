"use server";

import { revalidatePath } from "next/cache";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { C, getDb } from "@/lib/db";
import { dec, getDecimalStyle, num, type DecimalStyle } from "@/lib/decimal";
import { dateInputToStored } from "@/lib/format";
import {
  buildProjectShares,
  ensureSalaryRecords,
  isDisabled,
  isPaid,
  monthStart,
  salaryDueDate,
  todayLocal,
  type EmployeeFull,
  type SalaryRecord,
} from "@/lib/salary";

export type Result = { ok: true; id?: string } | { ok: false; error: string };
const fail = (error: string): Result => ({ ok: false, error });

async function admin() {
  const me = await getCurrentUser();
  return me?.isAdmin ? me : null;
}

const refresh = (id?: string) => {
  revalidatePath("/portal", "layout");
  if (id) revalidatePath(`/portal/employees/${id}`);
};

// Exactly the desktop app's EmployeeSalaryPayment / SalaryProjectShare fields (those C# classes
// reject unknown fields, so nothing extra may be written).
function recordDoc(r: SalaryRecord, style: DecimalStyle) {
  return {
    month: r.month,
    amount: dec(num(r.amount), style),
    dueDate: r.dueDate ?? salaryDueDate(r.month),
    paidAt: r.paidAt ?? null,
    projectShares: (r.projectShares ?? []).map((s) => ({
      projectId: s.projectId,
      projectName: s.projectName,
      percent: dec(num(s.percent), style),
      amount: dec(num(s.amount), style),
    })),
  };
}

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date.");

const employeeSchema = z.object({
  name: z.string().trim().min(1, "Enter the employee's name.").max(200),
  designation: z.string().trim().min(1, "Enter the designation.").max(200),
  phone: z.string().trim().max(50).default(""),
  monthlySalary: z.coerce.number().min(0, "Enter a valid monthly salary.").max(1_000_000),
  joiningDate: dateStr,
  status: z.enum(["Permanent", "Disabled"]),
  disabledAt: z.string().optional(),
  allocations: z.array(z.object({ projectId: z.string(), percent: z.coerce.number() })).max(50).default([]),
});

async function buildEmployeeFields(input: unknown) {
  const parsed = employeeSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." } as const;
  const d = parsed.data;
  const joining = dateInputToStored(d.joiningDate);
  if (joining > todayLocal()) return { error: "The joining date can't be in the future." } as const;

  let disabledAt: Date | null = null;
  if (d.status === "Disabled") {
    if (!d.disabledAt || !/^\d{4}-\d{2}-\d{2}$/.test(d.disabledAt)) return { error: "Choose the last working day." } as const;
    disabledAt = dateInputToStored(d.disabledAt);
    if (disabledAt < joining) return { error: "Last working day cannot be before the joining date." } as const;
    if (disabledAt > todayLocal()) return { error: "The last working day can't be in the future." } as const;
  }

  // Salary split validation, as in the desktop app.
  const db = await getDb();
  const seen = new Set<string>();
  let total = 0;
  const allocations: Array<{ projectId: string; projectName: string; percent: number }> = [];
  for (const a of d.allocations) {
    if (!ObjectId.isValid(a.projectId)) return { error: "Choose a project on every salary-split row, or remove the empty row." } as const;
    const project = await db.collection(C.projects).findOne({ _id: new ObjectId(a.projectId) }, { projection: { name: 1 } });
    if (!project) return { error: "A project in the salary split no longer exists." } as const;
    const name = String(project.name ?? "");
    if (!(a.percent > 0 && a.percent <= 100)) return { error: `Enter a percentage between 0 and 100 for ${name}.` } as const;
    if (seen.has(a.projectId)) return { error: `${name} is listed twice in the salary split.` } as const;
    seen.add(a.projectId);
    total += a.percent;
    allocations.push({ projectId: a.projectId, projectName: name, percent: a.percent });
  }
  if (total > 100) return { error: `The salary split adds up to ${Number(total.toFixed(2))}% - it can't be more than 100%.` } as const;

  return { fields: { ...d, joining, disabledAt, allocations } } as const;
}

// After any change: fill/tidy the salary months, and (while employed) make this month's
// record carry the current monthly salary - same as the desktop app's save.
function finalizeSalaries(emp: EmployeeFull, monthly: number): SalaryRecord[] {
  const { records } = ensureSalaryRecords(emp);
  if (!isDisabled(emp)) {
    const current = monthStart(todayLocal());
    let rec = records.find((r) => new Date(r.month).getTime() === current.getTime());
    if (!rec) {
      rec = { month: current, amount: monthly, dueDate: salaryDueDate(current), paidAt: null, projectShares: [] };
      records.unshift(rec);
    }
    rec.amount = monthly;
  }
  return records;
}

export async function createEmployee(input: unknown): Promise<Result> {
  if (!(await admin())) return fail("Only admins can add employees.");
  const built = await buildEmployeeFields(input);
  if ("error" in built) return fail(built.error as string);
  const f = built.fields;
  const db = await getDb();
  const style = await getDecimalStyle(db);

  const draft: EmployeeFull = {
    _id: new ObjectId(),
    name: f.name,
    designation: f.designation,
    phone: f.phone,
    monthlySalary: f.monthlySalary,
    joiningDate: f.joining,
    status: f.status,
    disabledAt: f.disabledAt,
    salaryPayments: [],
    createdAt: new Date(),
    projectAllocations: f.allocations,
  };
  const records = finalizeSalaries(draft, f.monthlySalary);
  await db.collection(C.employees).insertOne({
    _id: draft._id,
    name: draft.name,
    designation: draft.designation,
    phone: draft.phone,
    monthlySalary: dec(f.monthlySalary, style),
    joiningDate: draft.joiningDate,
    status: draft.status,
    disabledAt: draft.disabledAt,
    salaryPayments: records.map((r) => recordDoc(r, style)),
    createdAt: draft.createdAt,
    projectAllocations: f.allocations.map((a) => ({ projectId: a.projectId, projectName: a.projectName, percent: dec(a.percent, style) })),
  });
  refresh();
  return { ok: true, id: draft._id.toHexString() };
}

export async function updateEmployee(id: string, input: unknown): Promise<Result> {
  if (!(await admin())) return fail("Only admins can edit employees.");
  if (!ObjectId.isValid(id)) return fail("Employee not found.");
  const built = await buildEmployeeFields(input);
  if ("error" in built) return fail(built.error as string);
  const f = built.fields;
  const db = await getDb();
  const style = await getDecimalStyle(db);
  const existing = await db.collection<EmployeeFull>(C.employees).findOne({ _id: new ObjectId(id) });
  if (!existing) return fail("Employee not found.");

  const updated: EmployeeFull = {
    ...existing,
    name: f.name,
    designation: f.designation,
    phone: f.phone,
    monthlySalary: f.monthlySalary,
    joiningDate: f.joining,
    status: f.status,
    disabledAt: f.disabledAt,
    projectAllocations: f.allocations,
  };
  const records = finalizeSalaries(updated, f.monthlySalary);
  await db.collection(C.employees).updateOne(
    { _id: existing._id },
    {
      $set: {
        name: f.name,
        designation: f.designation,
        phone: f.phone,
        monthlySalary: dec(f.monthlySalary, style),
        joiningDate: f.joining,
        status: f.status,
        disabledAt: f.disabledAt,
        projectAllocations: f.allocations.map((a) => ({ projectId: a.projectId, projectName: a.projectName, percent: dec(a.percent, style) })),
        salaryPayments: records.map((r) => recordDoc(r, style)),
      },
    },
  );
  // Users keep a copy of the linked employee's name.
  if (existing.name !== f.name) await db.collection(C.users).updateMany({ employeeId: id }, { $set: { employeeName: f.name } });
  refresh(id);
  return { ok: true, id };
}

export async function deleteEmployee(id: string, confirmName: string): Promise<Result> {
  if (!(await admin())) return fail("Only admins can delete employees.");
  if (!ObjectId.isValid(id)) return fail("Employee not found.");
  const db = await getDb();
  const emp = await db.collection(C.employees).findOne({ _id: new ObjectId(id) }, { projection: { name: 1 } });
  if (!emp) return fail("Employee not found.");
  if (confirmName.trim() !== String(emp.name ?? "").trim()) return fail("Type the employee's name exactly to confirm.");
  await db.collection(C.employees).deleteOne({ _id: emp._id });
  // Don't leave user accounts pointing at an employee that no longer exists.
  await db.collection(C.users).updateMany({ employeeId: id }, { $set: { employeeId: null, employeeName: "" } });
  refresh();
  return { ok: true };
}

const recordsSchema = z.object({
  rows: z
    .array(
      z.object({
        month: z.string(), // ISO of the stored month
        amount: z.coerce.number().min(0, "Each salary row needs a valid non-negative salary amount."),
        paid: z.boolean(),
        paidDate: z.string().optional(),
      }),
    )
    .max(1200),
});

// Save Salary Records: amounts, paid/unpaid and paid dates for every month.
export async function saveSalaryRecords(id: string, input: unknown): Promise<Result> {
  if (!(await admin())) return fail("Only admins can change salary records.");
  if (!ObjectId.isValid(id)) return fail("Employee not found.");
  const parsed = recordsSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the salary rows.");

  const db = await getDb();
  const style = await getDecimalStyle(db);
  const emp = await db.collection<EmployeeFull>(C.employees).findOne({ _id: new ObjectId(id) });
  if (!emp) return fail("Employee not found.");
  const { records } = ensureSalaryRecords(emp);
  const byMonth = new Map(records.map((r) => [new Date(r.month).toISOString(), r]));
  const today = todayLocal();

  for (const row of parsed.data.rows) {
    const rec = byMonth.get(row.month);
    if (!rec) return fail("The salary months changed while you were editing. Reload and try again.");
    const wasPaid = isPaid(rec);
    const previous = num(rec.amount);
    rec.amount = row.amount;
    if (row.paid) {
      if (!row.paidDate || !/^\d{4}-\d{2}-\d{2}$/.test(row.paidDate)) return fail("Choose a paid date for every month marked paid.");
      const paidAt = dateInputToStored(row.paidDate);
      if (paidAt > today) return fail("A paid date can't be in the future.");
      rec.paidAt = paidAt;
    } else {
      rec.paidAt = null;
    }

    // Charged to projects when paid; already-paid months keep their split (rescaled if corrected).
    if (!isPaid(rec)) rec.projectShares = [];
    else if (!wasPaid) rec.projectShares = buildProjectShares(emp.projectAllocations, row.amount);
    else if (previous !== row.amount && previous !== 0) {
      rec.projectShares = (rec.projectShares ?? []).map((s) => ({ ...s, amount: Math.round(((num(s.amount) * row.amount) / previous) * 1000) / 1000 }));
    }
  }

  // The employee's monthly salary follows this month's record (or the last one if they left).
  const current = isDisabled(emp) ? records[0] : records.find((r) => new Date(r.month).getTime() === monthStart(today).getTime());
  const set: Record<string, unknown> = { salaryPayments: records.map((r) => recordDoc(r, style)) };
  if (current) set.monthlySalary = dec(num(current.amount), style);
  await db.collection(C.employees).updateOne({ _id: emp._id }, { $set: set });
  refresh(id);
  return { ok: true, id };
}
