import type { NextAuthRequest } from "next-auth";
import { NextResponse } from "next/server";

import { resolveSessionAppStartPath } from "@/lib/app-entry";
import { auth } from "@/lib/auth";
import { isBranchAccessKeyPath } from "@/lib/branch-access-key";

export default auth((req: NextAuthRequest) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth?.user?.id;
  const appStartPath = isLoggedIn ? resolveSessionAppStartPath(req.auth?.user) : null;
  const isEmployeeAccessLink = isBranchAccessKeyPath(nextUrl.pathname);
  const isInternalEmployeeAccess = nextUrl.pathname.startsWith("/employee-access/");
  const isOnLogin = nextUrl.pathname.startsWith("/login");
  const isOnRegister = nextUrl.pathname === "/register";
  const isOnOnboarding = nextUrl.pathname === "/onboarding";

  if (isEmployeeAccessLink) {
    const rewriteUrl = new URL(`/employee-access${nextUrl.pathname}`, nextUrl);
    return NextResponse.rewrite(rewriteUrl);
  }

  if (isLoggedIn && isOnLogin) {
    return Response.redirect(new URL(appStartPath ?? "/", nextUrl));
  }

  if (isLoggedIn && isOnRegister) {
    return Response.redirect(new URL(appStartPath ?? "/", nextUrl));
  }

  if (isLoggedIn && isOnOnboarding && appStartPath !== "/onboarding") {
    return Response.redirect(new URL(appStartPath ?? "/", nextUrl));
  }

  const isPublic =
    nextUrl.pathname === "/" ||
    isOnLogin ||
    nextUrl.pathname === "/register" ||
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

  if (!isLoggedIn) {
    return Response.redirect(new URL("/login", nextUrl));
  }
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|sw.js|manifest.json|icons/).*)" ],
};
