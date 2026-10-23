import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { loginSchema } from "@/lib/validations/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { getTenantEntitlement, isPlatformSuperAdmin } from "@/lib/subscription";

const SESSION_MAX_AGE = Number(process.env.SESSION_MAX_AGE_SECONDS ?? 28800);

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
    maxAge: SESSION_MAX_AGE,
  },

  jwt: {
    maxAge: SESSION_MAX_AGE,
  },

  pages: {
    signIn: "/login",
  },

  providers: [
    CredentialsProvider({
      name: "Username & password",

      credentials: {
        username: {
          label: "Username",
          type: "text",
        },
        password: {
          label: "Password",
          type: "password",
        },
      },

      async authorize(raw, req) {
        const parsed = loginSchema.safeParse(raw);

        if (!parsed.success) {
          return null;
        }

        const { username, password } = parsed.data;

        const ip =
          (req?.headers as Record<string, string> | undefined)?.[
            "x-forwarded-for"
          ] ?? "unknown";

        const allowed = await checkRateLimit(
          `login:${username.toLowerCase()}:${ip}`,
          5,
          60,
        );

        if (!allowed) {
          throw new Error("TOO_MANY_ATTEMPTS");
        }

        const user = await prisma.user.findUnique({
          where: {
            username,
          },

          include: {
            tenant: {
              select: {
                id: true,
                isActive: true,
              },
            },

            defaultBranch: {
              select: {
                id: true,
                name: true,
                isActive: true,
                businessId: true,

                business: {
                  select: {
                    legalName: true,
                    isActive: true,
                  },
                },
              },
            },
          },
        });

        const hashToCheck =
          user?.passwordHash ?? "$2a$12$invalidsaltinvalidsaltinvalidsaltinv.";

        const passwordOk = await bcrypt.compare(password, hashToCheck);

        if (!user || !user.isActive || !passwordOk) {
          return null;
        }

        if (isPlatformSuperAdmin(user.platformRole)) {
          if (
            !user.defaultBranch ||
            !user.defaultBranch.isActive ||
            !user.defaultBranch.business.isActive
          ) {
            return null;
          }

          await prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
          });

          return {
            id: String(user.id),
            name: user.fullName,
            username: user.username,
            role: user.role,
            platformRole: user.platformRole,
            tenantId: user.tenantId,
            businessId: user.defaultBranch.businessId,
            branchId: user.defaultBranch.id,
            businessName: user.defaultBranch.business.legalName,
            branchName: user.defaultBranch.name,
            subscriptionStatus: "PLATFORM",
            subscriptionAccess: true,
            subscriptionReason: null,
            subscriptionPlanName: "Platform",
            subscriptionTrialEndsAt: null,
            subscriptionPeriodEnd: null,
          };
        }

        if (
          !user.defaultBranch ||
          !user.defaultBranch.isActive ||
          !user.defaultBranch.business.isActive
        ) {
          return null;
        }

        const entitlement = await getTenantEntitlement(user.tenantId);

        const access = await prisma.userBranchAccess.findUnique({
          where: {
            userId_branchId: {
              userId: user.id,
              branchId: user.defaultBranch.id,
            },
          },
        });

        if (!access?.isActive) {
          return null;
        }

        await prisma.user.update({
          where: {
            id: user.id,
          },
          data: {
            lastLoginAt: new Date(),
          },
        });

        return {
          id: String(user.id),

          name: user.fullName,

          username: user.username,

          role: access.role || user.role,

          platformRole: user.platformRole,

          tenantId: user.tenantId,

          businessId: user.defaultBranch.businessId,

          branchId: user.defaultBranch.id,

          businessName: user.defaultBranch.business.legalName,

          branchName: user.defaultBranch.name,

          subscriptionStatus: entitlement.status,

          subscriptionAccess: entitlement.canUseApp,

          subscriptionReason: entitlement.reason,

          subscriptionPlanName: entitlement.planName,

          subscriptionTrialEndsAt: entitlement.trialEndsAt
            ? entitlement.trialEndsAt.toISOString()
            : null,

          subscriptionPeriodEnd: entitlement.currentPeriodEnd
            ? entitlement.currentPeriodEnd.toISOString()
            : null,
        };
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user, trigger, session }) {
      /*
       * Fresh login.
       */
      if (user) {
        const currentUser = user as typeof user & {
          username: string;
          role: string;
          tenantId: number;
          businessId: number;
          branchId: number;
          businessName: string;
          branchName: string;
          platformRole?: string | null;
          subscriptionStatus: string;
          subscriptionAccess: boolean;
          subscriptionReason: string | null;
          subscriptionPlanName: string | null;
          subscriptionTrialEndsAt: string | null;
          subscriptionPeriodEnd: string | null;
        };

        token.id = user.id;
        token.username = currentUser.username;
        token.role = currentUser.role;
        token.platformRole = currentUser.platformRole || null;

        token.tenantId = currentUser.tenantId;
        token.businessId = currentUser.businessId;
        token.branchId = currentUser.branchId;

        token.businessName = currentUser.businessName;

        token.branchName = currentUser.branchName;

        token.subscriptionStatus = currentUser.subscriptionStatus;

        token.subscriptionAccess = currentUser.subscriptionAccess;

        token.subscriptionReason = currentUser.subscriptionReason;

        token.subscriptionPlanName = currentUser.subscriptionPlanName;

        token.subscriptionTrialEndsAt = currentUser.subscriptionTrialEndsAt;

        token.subscriptionPeriodEnd = currentUser.subscriptionPeriodEnd;

        return token;
      }

      /*
       * Branch switch requested through useSession().update().
       * The requested branch is always re-validated against
       * active UserBranchAccess before changing JWT context.
       */
      if (trigger === "update" && token.id && session?.branchId) {
        const requestedBranchId = Number(session.branchId);
        const access = await prisma.userBranchAccess.findUnique({
          where: {
            userId_branchId: {
              userId: Number(token.id),
              branchId: requestedBranchId,
            },
          },
          include: {
            branch: {
              include: {
                business: {
                  select: { legalName: true, isActive: true, tenantId: true },
                },
              },
            },
          },
        });

        if (
          access?.isActive &&
          access.branch.isActive &&
          access.branch.business.isActive &&
          access.branch.business.tenantId === token.tenantId
        ) {
          token.branchId = access.branch.id;
          token.businessId = access.branch.businessId;
          token.branchName = access.branch.name;
          token.businessName = access.branch.business.legalName;
          token.role = access.role || token.role;

          await prisma.user.update({
            where: { id: Number(token.id) },
            data: { defaultBranchId: access.branch.id },
          });
        }
      }

      /*
       * Important:
       *
       * Refresh old/incomplete JWT tokens.
       *
       * This handles sessions created before
       * tenant/business/branch support existed.
       */
      if (
        token.id &&
        (!token.tenantId || !token.businessId || !token.branchId)
      ) {
        const dbUser = await prisma.user.findUnique({
          where: {
            id: Number(token.id),
          },

          include: {
            tenant: {
              select: {
                id: true,
                isActive: true,
              },
            },

            defaultBranch: {
              select: {
                id: true,
                name: true,
                businessId: true,
                isActive: true,

                business: {
                  select: {
                    legalName: true,
                    isActive: true,
                  },
                },
              },
            },
          },
        });

        if (
          dbUser &&
          dbUser.isActive &&
          dbUser.defaultBranch &&
          dbUser.defaultBranch.isActive &&
          dbUser.defaultBranch.business.isActive
        ) {
          const access = await prisma.userBranchAccess.findUnique({
            where: {
              userId_branchId: {
                userId: dbUser.id,
                branchId: dbUser.defaultBranch.id,
              },
            },
          });

          if (access?.isActive) {
            token.id = String(dbUser.id);

            token.username = dbUser.username;

            token.role = access.role || dbUser.role;

            token.platformRole = dbUser.platformRole || null;

            token.tenantId = dbUser.tenantId;

            token.businessId = dbUser.defaultBranch.businessId;

            token.branchId = dbUser.defaultBranch.id;

            token.businessName = dbUser.defaultBranch.business.legalName;

            token.branchName = dbUser.defaultBranch.name;

            if (isPlatformSuperAdmin(dbUser.platformRole)) {
              token.subscriptionStatus = "PLATFORM";
              token.subscriptionAccess = true;
              token.subscriptionReason = null;
              token.subscriptionPlanName = "Platform";
              token.subscriptionTrialEndsAt = null;
              token.subscriptionPeriodEnd = null;
            } else {
              const entitlement = await getTenantEntitlement(dbUser.tenantId);

              token.subscriptionStatus = entitlement.status;

              token.subscriptionAccess = entitlement.canUseApp;

              token.subscriptionReason = entitlement.reason;

              token.subscriptionPlanName = entitlement.planName;

              token.subscriptionTrialEndsAt = entitlement.trialEndsAt
                ? entitlement.trialEndsAt.toISOString()
                : null;

              token.subscriptionPeriodEnd = entitlement.currentPeriodEnd
                ? entitlement.currentPeriodEnd.toISOString()
                : null;
            }
          }
        }
      }

      /*
       * Refresh current subscription state whenever NextAuth
       * refreshes/reads the JWT. This keeps session status reasonably
       * fresh without blocking valid credential authentication.
       */
      if (token.id && token.tenantId && token.platformRole !== "SUPER_ADMIN") {
        const entitlement = await getTenantEntitlement(Number(token.tenantId));

        token.subscriptionStatus = entitlement.status;

        token.subscriptionAccess = entitlement.canUseApp;

        token.subscriptionReason = entitlement.reason;

        token.subscriptionPlanName = entitlement.planName;

        token.subscriptionTrialEndsAt = entitlement.trialEndsAt
          ? entitlement.trialEndsAt.toISOString()
          : null;

        token.subscriptionPeriodEnd = entitlement.currentPeriodEnd
          ? entitlement.currentPeriodEnd.toISOString()
          : null;
      }

      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;

        session.user.username = token.username as string;

        session.user.role = token.role as string;

        session.user.platformRole =
          (token.platformRole as string | null) ?? null;

        session.user.tenantId = token.tenantId as number;

        session.user.businessId = token.businessId as number;

        session.user.branchId = token.branchId as number;

        session.user.businessName = token.businessName as string;

        session.user.branchName = token.branchName as string;

        session.user.subscriptionStatus =
          (token.subscriptionStatus as string) || "MISSING";

        session.user.subscriptionAccess = token.subscriptionAccess === true;

        session.user.subscriptionReason =
          (token.subscriptionReason as string | null) ?? null;

        session.user.subscriptionPlanName =
          (token.subscriptionPlanName as string | null) ?? null;

        session.user.subscriptionTrialEndsAt =
          (token.subscriptionTrialEndsAt as string | null) ?? null;

        session.user.subscriptionPeriodEnd =
          (token.subscriptionPeriodEnd as string | null) ?? null;
      }

      return session;
    },
  },

  useSecureCookies: process.env.NODE_ENV === "production",

  secret: process.env.NEXTAUTH_SECRET,
};
