import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      username: string;
      role: string;
      platformRole: string | null;
      tenantId: number;
      businessId: number;
      branchId: number;
      businessName: string;
      branchName: string;

      subscriptionStatus: string;
      subscriptionAccess: boolean;
      subscriptionReason: string | null;
      subscriptionPlanName: string | null;
      subscriptionTrialEndsAt: string | null;
      subscriptionPeriodEnd: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    username: string;
    role: string;
    platformRole?: string | null;
    tenantId: number;
    businessId: number;
    branchId: number;
    businessName: string;
    branchName: string;

    subscriptionStatus: string;
    subscriptionAccess: boolean;
    subscriptionReason: string | null;
    subscriptionPlanName: string | null;
    subscriptionTrialEndsAt: string | null;
    subscriptionPeriodEnd: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    username: string;
    role: string;
    platformRole: string | null;
    tenantId: number;
    businessId: number;
    branchId: number;
    businessName: string;
    branchName: string;

    subscriptionStatus: string;
    subscriptionAccess: boolean;
    subscriptionReason: string | null;
    subscriptionPlanName: string | null;
    subscriptionTrialEndsAt: string | null;
    subscriptionPeriodEnd: string | null;
  }
}
