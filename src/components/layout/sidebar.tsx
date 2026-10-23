"use client";

import Link from "next/link";

import { usePathname } from "next/navigation";

import { useSession } from "next-auth/react";

import {
  BarChart3,
  ClipboardList,
  ShieldCheck,
  FileBarChart,
  LayoutDashboard,
  Package,
  Settings,
  ShoppingCart,
  TrendingUp,
  Truck,
  UserRound,
  Users,
} from "lucide-react";

import { cn } from "@/lib/utils";

import { can, type Permission } from "@/lib/rbac";

type NavItem = {
  href: string;

  label: string;

  icon: React.ComponentType<{
    className?: string;
  }>;

  permission?: Permission;
};

const NAV_ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
  },

  {
    href: "/pos",
    label: "POS Billing",
    icon: ShoppingCart,
    permission: "MAKE_SALE",
  },

  {
    href: "/sales",
    label: "Sales Analytics",
    icon: TrendingUp,
    permission: "VIEW_REPORTS",
  },

  {
    href: "/purchases",
    label: "Purchase & GRN",
    icon: Truck,
    permission: "MANAGE_PURCHASES",
  },

  {
    href: "/reports",
    label: "Reports",
    icon: FileBarChart,
    permission: "VIEW_REPORTS",
  },

  {
    href: "/stock",
    label: "Stock Reports",
    icon: BarChart3,
    permission: "MANAGE_CATALOG",
  },

  {
    href: "/products",
    label: "Items Master",
    icon: Package,
    permission: "MANAGE_CATALOG",
  },

  {
    href: "/suppliers",
    label: "Suppliers",
    icon: Truck,
    permission: "MANAGE_SUPPLIERS",
  },

  {
    href: "/customers",
    label: "Customers",
    icon: Users,
    permission: "MANAGE_CUSTOMERS",
  },


  {
    href: "/operations",
    label: "Operations",
    icon: ClipboardList,
    permission: "OPERATE_FINANCE",
  },

  {
    href: "/audit",
    label: "Audit Log",
    icon: ShieldCheck,
    permission: "VIEW_AUDIT",
  },
  {
    href: "/users",
    label: "Users",
    icon: UserRound,
    permission: "MANAGE_USERS",
  },

  {
    href: "/settings",
    label: "Settings",
    icon: Settings,
    permission: "MANAGE_SETTINGS",
  },
];

export function Sidebar() {
  const pathname = usePathname();

  const { data: session } = useSession();

  const role = session?.user?.role;

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-card md:flex">
      <div className="flex h-16 items-center gap-2 border-b border-border px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Package className="h-4 w-4" />
        </div>

        <span className="font-serif text-lg font-semibold tracking-tight">
          {process.env.NEXT_PUBLIC_APP_NAME || "IMS"}
        </span>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {NAV_ITEMS.filter(
          (item) => !item.permission || can(role, item.permission),
        ).map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);

          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",

                active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />

              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
