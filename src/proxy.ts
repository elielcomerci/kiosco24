import type { NextAuthRequest } from "next-auth";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";

export default auth((req: NextAuthRequest) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth?.user?.id;
  const isEmployeeAccessLink = /^\/KIOSCO-[A-Z0-9]{8}-[A-Z0-9]{8}$/i.test(nextUrl.pathname);
  const isInternalEmployeeAccess = nextUrl.pathname.startsWith("/employee-access/");

  if (isEmployeeAccessLink) {
    const rewriteUrl = new URL(`/employee-access${nextUrl.pathname}`, nextUrl);
    return NextResponse.rewrite(rewriteUrl);
  }

  const isPublic =
    nextUrl.pathname === "/" ||
    nextUrl.pathname === "/onboarding" ||
    isInternalEmployeeAccess ||
    nextUrl.pathname === "/sw.js" ||
    nextUrl.pathname === "/manifest.json" ||
    nextUrl.pathname.startsWith("/icons/") ||
    nextUrl.pathname.startsWith("/api/auth") ||
    nextUrl.pathname === "/reset-password";

  if (isPublic) {
    return;
  }

  const isApiRoute = nextUrl.pathname.startsWith("/api") && !nextUrl.pathname.startsWith("/api/auth");
  if (isApiRoute) {
    return;
  }

  const isOnLogin = nextUrl.pathname.startsWith("/login");
  if (isOnLogin) {
    if (isLoggedIn) {
      return Response.redirect(new URL("/", nextUrl));
    }
    return;
  }

  if (!isLoggedIn) {
    return Response.redirect(new URL("/login", nextUrl));
  }
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|sw.js|manifest.json|icons/).*)"],
};
