import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

const WORDS = [
  "BARK", "NOVA", "LIME", "JADE", "ECHO", "FROST", "HARB", "IRIS", "KITE", "LYNX",
  "MINT", "NEON", "OAKS", "PINE", "QUAY", "REEF", "SAGE", "TIDE", "UNIT", "VOLT",
  "WAVE", "AXIS", "BOLT", "CITY", "DUSK", "EDGE", "FLUX", "GLOW", "HIVE", "ICON",
];

export function normalizeInviteCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "-");
}

export function generateInviteCodeString(): string {
  const w = () => WORDS[randomBytes(2).readUInt16BE(0) % WORDS.length];
  const year = new Date().getFullYear();
  const suffix = randomBytes(3).toString("hex").slice(0, 4).toUpperCase();
  return `${w()}-${year}-${suffix}`;
}

export async function generateUniqueInviteCode(prisma: PrismaClient): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const code = generateInviteCodeString();
    const exists = await prisma.inviteCode.findUnique({ where: { code }, select: { id: true } });
    if (!exists) return code;
  }
  throw new Error("Could not generate unique invite code");
}

export type InviteValidationFailure = "missing" | "not_found" | "inactive" | "used" | "expired";

export function validateInviteRow(invite: {
  active: boolean;
  usedAt: Date | null;
  expiresAt: Date | null;
}): InviteValidationFailure | null {
  if (!invite.active) return "inactive";
  if (invite.usedAt != null) return "used";
  const now = new Date();
  if (invite.expiresAt != null && invite.expiresAt <= now) return "expired";
  return null;
}
