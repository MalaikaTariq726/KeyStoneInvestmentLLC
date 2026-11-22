import { NextResponse } from "next/server";
import { requestCode } from "@/lib/otp";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email : "";
  try {
    const result = await requestCode(email);
    if (!result.ok) return NextResponse.json(result, { status: result.retryAfter ? 429 : 400 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("request-code failed", error);
    return NextResponse.json({ ok: false, error: "Couldn't send the code right now. Please try again." }, { status: 500 });
  }
}
