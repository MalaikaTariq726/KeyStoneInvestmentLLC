import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

// First line of defence: no valid session cookie -> straight to /login. Pages and server
// actions still check the user (and role) against the database themselves.
export async function middleware(request: NextRequest) {
  const token = request.cookies.get("ks_session")?.value;
  const secret = process.env.SESSION_SECRET;
  let valid = false;
  if (token && secret) {
    try {
      await jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ["HS256"] });
      valid = true;
    } catch {
      valid = false;
    }
  }

  const isLogin = request.nextUrl.pathname === "/login";
  if (!valid && !isLogin) return NextResponse.redirect(new URL("/login", request.url));
  if (valid && isLogin) return NextResponse.redirect(new URL("/portal", request.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/portal/:path*", "/login"],
};
