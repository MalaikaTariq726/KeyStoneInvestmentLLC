import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ObjectId } from "mongodb";
import { SignJWT, jwtVerify } from "jose";
import { env } from "./env";
import { C, getDb } from "./db";
import { roleOf, type UserDoc } from "./models";

export const SESSION_COOKIE = "ks_session";
const SESSION_DAYS = 7;

function secretKey() {
  return new TextEncoder().encode(env.sessionSecret);
}

export async function createSession(userId: string) {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey());

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function destroySession() {
  (await cookies()).delete(SESSION_COOKIE);
}

export interface CurrentUser {
  id: string;
  fullName: string;
  email: string;
  role: "Admin" | "User";
  isAdmin: boolean;
  employeeName: string;
  doc: UserDoc;
}

// The session only carries the user id. Role, name and email are re-read from the database
// on every request, so a role change or removed account takes effect immediately.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  let userId: string | undefined;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    userId = payload.sub;
  } catch {
    return null;
  }
  if (!userId || !ObjectId.isValid(userId)) return null;

  const db = await getDb();
  const doc = await db.collection<UserDoc>(C.users).findOne({ _id: new ObjectId(userId) });
  if (!doc) return null;

  const email = (doc.email ?? "").trim().toLowerCase();
  if (!email.endsWith(`@${env.allowedDomain}`)) return null;

  const role = roleOf(doc.role);
  return {
    id: userId,
    fullName: doc.fullName || email,
    email,
    role,
    isAdmin: role === "Admin",
    employeeName: doc.employeeName ?? "",
    doc,
  };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.isAdmin) redirect("/portal");
  return user;
}
