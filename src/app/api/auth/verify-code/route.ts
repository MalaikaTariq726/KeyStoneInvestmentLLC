import { NextResponse } from "next/server";
import { verifyCode } from "@/lib/otp";
import { createSession } from "@/lib/auth";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email : "";
  const code = typeof body?.code === "string" ? body.code : "";
  try {
    const result = await verifyCode(email, code);
    if (!result.ok) return NextResponse.json(result, { status: 400 });
    await createSession(result.userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("verify-code failed", error);
    return NextResponse.json({ ok: false, error: "Couldn't sign you in right now. Please try again." }, { status: 500 });
  }
}
