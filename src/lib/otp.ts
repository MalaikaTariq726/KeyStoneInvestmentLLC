import "server-only";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { C, getDb } from "./db";
import { env } from "./env";
import { isMailConfigured, sendLoginCode } from "./mail";
import type { UserDoc } from "./models";

const CODE_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_SENDS_PER_HOUR = 5;

interface LoginCodeDoc {
  _id: string; // normalised email
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  lastSentAt: Date;
  sends: Date[];
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function isAllowedEmail(email: string) {
  return /^[^\s@]+@[^\s@]+$/.test(email) && email.endsWith(`@${env.allowedDomain}`);
}

function hashCode(email: string, code: string) {
  return createHmac("sha256", env.sessionSecret).update(`${email}:${code}`).digest("hex");
}

let indexReady = false;
async function codes() {
  const db = await getDb();
  const col = db.collection<LoginCodeDoc>(C.loginCodes);
  if (!indexReady) {
    await col.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 3600 }).catch(() => {});
    indexReady = true;
  }
  return col;
}

// Same case-insensitive, whitespace-tolerant match the desktop app's login uses.
export async function findUserByEmail(email: string) {
  const db = await getDb();
  const escaped = email.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return db.collection<UserDoc>(C.users).findOne({ email: { $regex: `^\\s*${escaped}\\s*$`, $options: "i" } });
}

export type RequestResult = { ok: true } | { ok: false; error: string; retryAfter?: number };

export async function requestCode(rawEmail: string): Promise<RequestResult> {
  const email = normalizeEmail(rawEmail);
  if (!isAllowedEmail(email)) {
    return { ok: false, error: `Use your @${env.allowedDomain} work email.` };
  }

  // Test mode with no mailbox (local, or a dummy deploy with ALLOW_TEST_LOGIN=1): don't send or
  // rate-limit anything - just let the form advance to the code box, where 000000 signs in.
  if (env.allowTestLogin && !isMailConfigured()) return { ok: true };

  const col = await codes();
  const now = Date.now();
  const existing = await col.findOne({ _id: email });
  if (existing && now - existing.lastSentAt.getTime() < RESEND_COOLDOWN_MS) {
    const retryAfter = Math.ceil((RESEND_COOLDOWN_MS - (now - existing.lastSentAt.getTime())) / 1000);
    return { ok: false, error: `Please wait ${retryAfter}s before requesting another code.`, retryAfter };
  }
  const recentSends = (existing?.sends ?? []).filter((d) => now - d.getTime() < 60 * 60 * 1000);
  if (recentSends.length >= MAX_SENDS_PER_HOUR) {
    return { ok: false, error: "Too many codes requested. Try again in an hour." };
  }

  const user = await findUserByEmail(email);
  // Unknown addresses get the same response as known ones, so the form can't be used to
  // discover who has an account. No email is sent for them.
  if (!user) return { ok: true };

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await col.updateOne(
    { _id: email },
    {
      $set: { codeHash: hashCode(email, code), expiresAt: new Date(now + CODE_TTL_MS), attempts: 0, lastSentAt: new Date(now), sends: [...recentSends, new Date(now)] },
    },
    { upsert: true },
  );

  await sendLoginCode(email, user.fullName, code);
  return { ok: true };
}

export type VerifyResult = { ok: true; userId: string } | { ok: false; error: string };

export async function verifyCode(rawEmail: string, rawCode: string): Promise<VerifyResult> {
  const email = normalizeEmail(rawEmail);
  const code = rawCode.replace(/\D/g, "");
  const invalid: VerifyResult = { ok: false, error: "That code isn't right. Check the email and try again." };
  if (!isAllowedEmail(email) || code.length !== 6) return invalid;

  // TEST sign-in shortcut: the fixed code 000000 signs in as any existing account, no email
  // required. Always on locally; on a deployed build it is OFF unless ALLOW_TEST_LOGIN=1 is set
  // (see env.allowTestLogin). Keep it off on any deployment with real data - while on, anyone
  // who knows an account's email can sign in with 000000.
  if (env.allowTestLogin && code === "000000") {
    const user = await findUserByEmail(email);
    if (!user) return invalid;
    console.warn(`[test-login] 000000 sign-in used for ${email}`);
    return { ok: true, userId: user._id.toHexString() };
  }

  const col = await codes();
  const entry = await col.findOne({ _id: email });
  if (!entry || entry.expiresAt.getTime() < Date.now()) {
    return { ok: false, error: "This code has expired. Request a new one." };
  }
  if (entry.attempts >= MAX_ATTEMPTS) {
    return { ok: false, error: "Too many wrong attempts. Request a new code." };
  }

  const expected = Buffer.from(entry.codeHash, "hex");
  const actual = Buffer.from(hashCode(email, code), "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    await col.updateOne({ _id: email }, { $inc: { attempts: 1 } });
    return invalid;
  }

  await col.deleteOne({ _id: email }); // one-time use
  const user = await findUserByEmail(email);
  if (!user) return invalid;
  return { ok: true, userId: user._id.toHexString() };
}
