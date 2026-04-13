import type { NextAuthRequest } from "next-auth";
import { NextResponse } from "next/server";

import { resolveSessionAppStartPath } from "@/lib/app-entry";
import { auth } from "@/lib/auth";
import { isBranchAccessKeyPath } from "@/lib/branch-access-key";

// Subdominios que sirven el panel del partner
const PARTNER_HOSTNAMES = ["partner.clikit.com.ar", "partners.clikit.com.ar"];

function isPartnerSubdomain(hostname: string): boolean {
  return PARTNER_HOSTNAMES.some((h) => hostname === h || hostname.startsWith(h));
}

/**
 * Extract subdomain from hostname for dynamic partner-view routing.
 *   pablo.clikit.com.ar → "pablo"
 *   maria.clikit.com.ar → "maria"
 *   clikit.com.ar       → null
 */
function getViewSlug(hostname: string): string | null {
  const host = hostname.split(":")[0];
  const parts = host.split(".");
  if (parts.length <= 3) return null;
  const slug = parts[0].toLowerCase();
  // Exclude known subdomains that have their own routing
  if (PARTNER_HOSTNAMES.includes(host)) return null;
  if (slug === "www") return null;
  return slug;
}

export default auth((req: NextAuthRequest) => {
  const { nextUrl } = req;
  const hostname = req.headers.get("host") ?? "";
  const isLoggedIn = !!req.auth?.user?.id;
  const userRole = req.auth?.user?.role;
  const appStartPath = isLoggedIn ? resolveSessionAppStartPath(req.auth?.user) : null;

  // ── Subdominio partner → reescribir a /partner internamente ──────────────
  if (isPartnerSubdomain(hostname)) {
    const origin = `${req.nextUrl.protocol}//${hostname}`;

    // Rutas protegidas: requieren PARTNER + auth
    const protectedPaths = ["/partner/cartera", "/partner/link", "/partner/ganancias", "/partner/clientes"];
    const isProtected = protectedPaths.some((p) => nextUrl.pathname.startsWith(p));

    // Auth paths
    const isAuthPath = nextUrl.pathname.startsWith("/login") ||
                       nextUrl.pathname === "/register" ||
                       nextUrl.pathname.startsWith("/api/auth");

    // Public landing paths
    const isPublicLanding = nextUrl.pathname === "/" ||
                            nextUrl.pathname === "/landing";
    const isPublicUnirse = nextUrl.pathname === "/unirse";

    // Auth paths: render normally
    if (isAuthPath) {
      return NextResponse.next();
    }

    // Public landing → rewrite to /partner-pub (no partner layout auth)
    if (isPublicLanding) {
      const url = new URL("/partner-pub", origin);
      url.search = nextUrl.search;
      return NextResponse.rewrite(url);
    }
    if (isPublicUnirse) {
      const url = new URL("/partner-unirse", origin);
      url.search = nextUrl.search;
      return NextResponse.rewrite(url);
    }

    // Rutas protegidas sin auth → redirect al login
    if (isProtected && !isLoggedIn) {
      const loginUrl = new URL("/login", origin);
      loginUrl.searchParams.set("callbackUrl", `${origin}/`);
      return Response.redirect(loginUrl);
    }

    // Si está logueado pero no es PARTNER → redirigir a su app
    if (userRole !== "PARTNER") {
      return Response.redirect(new URL(appStartPath ?? "/", origin));
    }

    // Partners logueados → reescribir a /partner/...
    const rewriteUrl = new URL(
      `/partner${nextUrl.pathname === "/" ? "" : nextUrl.pathname}`,
      origin,
    );
    rewriteUrl.search = nextUrl.search;
    return NextResponse.rewrite(rewriteUrl);
  }

  // ── Subdominio dinámico {slug} → /partner-view/{slug} ─────────────────
  const viewSlug = getViewSlug(hostname);
  if (viewSlug) {
    const origin = `${req.nextUrl.protocol}//${hostname}`;
    const rewriteUrl = new URL(`/partner-view/${viewSlug}`, origin);
    rewriteUrl.search = nextUrl.search;
    return NextResponse.rewrite(rewriteUrl);
  }

  // ── Lógica existente ─────────────────────────────────────────────────────
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

  // ── Protección de rutas por rol ──────────────────────────────────────────

  // /admin solo para PLATFORM_ADMIN
  if (nextUrl.pathname.startsWith("/admin")) {
    if (!isLoggedIn) {
      return Response.redirect(new URL("/login", nextUrl));
    }
    if (userRole !== "PLATFORM_ADMIN") {
      return Response.redirect(new URL(appStartPath ?? "/", nextUrl));
    }
  }

  // /partner solo para PARTNER — en el dominio principal
  // (en subdominio ya está manejado arriba)
  if (nextUrl.pathname.startsWith("/partner")) {
    if (!isLoggedIn) {
      return Response.redirect(new URL("/login", nextUrl));
    }
    if (userRole !== "PARTNER") {
      return Response.redirect(new URL(appStartPath ?? "/", nextUrl));
    }
  }

  // ── Rutas públicas ───────────────────────────────────────────────────────
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

  const isApiRoute =
    nextUrl.pathname.startsWith("/api") && !nextUrl.pathname.startsWith("/api/auth");
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