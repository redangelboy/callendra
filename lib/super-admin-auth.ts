import { SignJWT, jwtVerify } from "jose";
import type { NextRequest } from "next/server";

export const ADMIN_SESSION_COOKIE = "callendra-admin-session";

function getSecret(): Uint8Array {
  const s = process.env.ADMIN_JWT_SECRET?.trim();
  if (!s) throw new Error("ADMIN_JWT_SECRET is not set");
  return new TextEncoder().encode(s);
}

export async function signSuperAdminToken(email: string): Promise<string> {
  return new SignJWT({ role: "super_admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(email)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());
}

export async function verifySuperAdminToken(token: string): Promise<{ email: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const email = typeof payload.sub === "string" ? payload.sub : null;
    if (!email) return null;
    return { email };
  } catch {
    return null;
  }
}

export async function getSuperAdminFromRequest(req: NextRequest): Promise<{ email: string } | null> {
  const token = req.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySuperAdminToken(token);
}
