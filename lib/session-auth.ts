import type { NextRequest } from "next/server";

export type AppSession = {
  ownerId?: string;
  staffUserId?: string;
  role?: string;
  businessId?: string;
  businessName?: string;
};

export function readSession(req: NextRequest): AppSession | null {
  const raw = req.cookies.get("session")?.value;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AppSession;
  } catch {
    return null;
  }
}

export function canManageBusiness(session: AppSession | null): boolean {
  if (!session) return false;
  if (session.ownerId) return true;
  return !!(session.staffUserId && session.role === "ADMIN");
}

