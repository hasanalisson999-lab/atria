import { NextResponse } from "next/server";
import { AUTH_COOKIE, authToken } from "@/lib/session";

/** Password sign-in for the deployed app (APP_PASSWORD). Sets a long-lived, http-only cookie. */
export async function POST(req: Request) {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.json({ ok: true });
  const { password: given } = (await req.json().catch(() => ({}))) as { password?: string };
  // Constant-time-ish compare via the hashed token.
  if (!given || (await authToken(given)) !== (await authToken(password))) {
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    return NextResponse.json({ ok: false, error: "Wrong password" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, await authToken(password), { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 90 });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(AUTH_COOKIE);
  return res;
}
