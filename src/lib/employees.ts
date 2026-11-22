import "server-only";
import { ObjectId } from "mongodb";
import { C, getDb } from "./db";
import type { EmployeeFull } from "./salary";

export async function listEmployeesFull(): Promise<EmployeeFull[]> {
  const db = await getDb();
  const rows = await db.collection<EmployeeFull>(C.employees).find({}).toArray();
  return rows.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
}

export async function getEmployee(id: string): Promise<EmployeeFull | null> {
  if (!ObjectId.isValid(id)) return null;
  const db = await getDb();
  return db.collection<EmployeeFull>(C.employees).findOne({ _id: new ObjectId(id) });
}
