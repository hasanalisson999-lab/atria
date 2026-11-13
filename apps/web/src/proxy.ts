import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, SEED_COOKIE, SEED_TTL_S, authToken } from "@/lib/session";


export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Password gate, only when APP_PASSWORD is set (the deployed app). Cron calls carry their own secret.
  const password = process.env.APP_PASSWORD;
  if (password && !pathname.startsWith("/login") && !pathname.startsWith("/api/auth") && !pathname.startsWith("/api/cron")) {
    const ok = req.cookies.get(AUTH_COOKIE)?.value === (await authToken(password));
    if (!ok) {
      if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
      return NextResponse.redirect(url);
    }
  }

  // Stable feed seed: created once and kept for an hour, so refreshes, popups and saves never reshuffle.
  if (pathname.startsWith("/discover") && !req.cookies.get(SEED_COOKIE)) {
    const seed = Date.now().toString(36);
    const headers = new Headers(req.headers);
    headers.set("cookie", [req.headers.get("cookie"), `${SEED_COOKIE}=${seed}`].filter(Boolean).join("; "));
    const res = NextResponse.next({ request: { headers } });
    res.cookies.set(SEED_COOKIE, seed, { maxAge: SEED_TTL_S, path: "/", sameSite: "lax" });
    return res;
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
