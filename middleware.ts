import { NextResponse, NextRequest } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { jwtVerify } from "jose";
import { routing } from "./next-intl.config";
import { ADMIN_SESSION_COOKIE } from "./lib/super-admin-auth";

const intlMiddleware = createIntlMiddleware(routing);

function adminSecretKey(): Uint8Array | null {
  const s = process.env.ADMIN_JWT_SECRET?.trim();
  if (!s) return null;
  return new TextEncoder().encode(s);
}

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/admin")) {
    if (pathname === "/admin/login" || pathname.startsWith("/admin/login/")) {
      return NextResponse.next();
    }
    const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
    const key = adminSecretKey();
    if (!token || !key) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
    try {
      await jwtVerify(token, key);
    } catch {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
    return NextResponse.next();
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);
  /** Path + query (e.g. staff-day token) for scoped PWA manifest start_url */
  requestHeaders.set("x-pathsearch", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return intlMiddleware(
    new NextRequest(request.url, { headers: requestHeaders }),
  );
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
