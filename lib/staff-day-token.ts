import { randomBytes } from "crypto";

export function newStaffDayViewToken(): string {
  return randomBytes(24).toString("base64url");
}
