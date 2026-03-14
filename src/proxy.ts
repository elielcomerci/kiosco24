import { auth } from "@/lib/auth";

export default auth((req: any) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth;

  const isPublic = nextUrl.pathname === "/" || nextUrl.pathname === "/onboarding";
  if (isPublic) return;

  const isOnOptions = nextUrl.pathname.startsWith("/api");
  if (isOnOptions) return; // Permitir que las API routes manejen su propia autenticación

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

// Opcional: configurar en qué rutas NO se ejecuta el proxy
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
