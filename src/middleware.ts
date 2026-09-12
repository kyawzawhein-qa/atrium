import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE = "atrium_session";

function getSecret() {
  const raw =
    process.env.ATRIUM_SESSION_SECRET ||
    process.env.ATRIUM_PASSWORD ||
    "atrium-local-demo-secret";
  return new TextEncoder().encode(raw);
}

async function hasValidSession(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return false;
  try {
    await jwtVerify(token, getSecret());
    return true;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const authed = await hasValidSession(req);

  if (pathname.startsWith("/login")) {
    if (authed) {
      return NextResponse.redirect(new URL("/chat", req.url));
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/chat") || pathname.startsWith("/api/")) {
    if (
      pathname.startsWith("/api/auth/login") ||
      pathname.startsWith("/api/auth/logout")
    ) {
      return NextResponse.next();
    }
    if (!authed) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const login = new URL("/login", req.url);
      login.searchParams.set("next", pathname);
      return NextResponse.redirect(login);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/login", "/chat/:path*", "/api/:path*"],
};
