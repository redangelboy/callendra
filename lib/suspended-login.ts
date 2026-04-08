import { NextResponse } from "next/server";

export const SUSPENDED_LOGIN_MESSAGE =
  "Your account has been suspended. Please contact support at support@callendra.com";

export function suspendedLoginResponse() {
  return NextResponse.json({ success: false, message: SUSPENDED_LOGIN_MESSAGE }, { status: 403 });
}
