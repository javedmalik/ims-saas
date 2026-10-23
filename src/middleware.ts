import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { ROUTE_PERMISSIONS, PERMISSIONS, type Permission } from "@/lib/rbac";

const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/api/auth",
  "/api/public",
  "/api/razorpay/webhook",
];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

function matchPermission(pathname: string): Permission | null {
  const match = ROUTE_PERMISSIONS.find((r) => pathname.startsWith(r.prefix));
  return match ? match.permission : null;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    isPublic(pathname) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  if (!token) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const isSubscriptionStatusPath =
    pathname === "/subscription-status" ||
    pathname.startsWith("/subscription-status/") ||
    pathname === "/api/subscription-status" ||
    pathname.startsWith("/api/subscription-status/");

  const isSubscriptionBillingPath =
    pathname === "/subscription/checkout" ||
    pathname.startsWith("/subscription/checkout/") ||
    pathname === "/api/subscription/checkout" ||
    pathname.startsWith("/api/subscription/checkout/");

  const isSuperAdminPath =
    pathname === "/super-admin" ||
    pathname.startsWith("/super-admin/") ||
    pathname === "/api/super-admin" ||
    pathname.startsWith("/api/super-admin/");

  if (isSuperAdminPath) {
    if (token.platformRole !== "SUPER_ADMIN") {
      if (pathname.startsWith("/api")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      return NextResponse.redirect(
        new URL("/dashboard?error=forbidden", req.url),
      );
    }

    return NextResponse.next();
  }

  /*
   * A tenant user with an invalid subscription remains authenticated,
   * but cannot access operational pages or APIs.
   */
  if (
    token.platformRole !== "SUPER_ADMIN" &&
    token.subscriptionAccess === false
  ) {
    if (isSubscriptionStatusPath || isSubscriptionBillingPath) {
      return NextResponse.next();
    }

    if (pathname.startsWith("/api")) {
      return NextResponse.json(
        {
          error:
            (token.subscriptionReason as string) ||
            "Subscription access is restricted.",
          code: "SUBSCRIPTION_RESTRICTED",
          subscriptionStatus: (token.subscriptionStatus as string) || "UNKNOWN",
        },
        { status: 403 },
      );
    }

    return NextResponse.redirect(new URL("/subscription-status", req.url));
  }

  /*
   * Users with a valid subscription should not remain on the
   * restricted page after their subscription is restored.
   */
  if (
    isSubscriptionStatusPath &&
    token.platformRole !== "SUPER_ADMIN" &&
    token.subscriptionAccess !== false
  ) {
    if (pathname.startsWith("/api")) {
      return NextResponse.next();
    }

    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  const permission = matchPermission(pathname);
  if (permission) {
    const allowedRoles = PERMISSIONS[permission] as readonly string[];
    if (!allowedRoles.includes(token.role as string)) {
      if (pathname.startsWith("/api")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return NextResponse.redirect(
        new URL("/dashboard?error=forbidden", req.url),
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  // Run on everything except static assets; API + page auth both handled above.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|assets).*)"],
};
