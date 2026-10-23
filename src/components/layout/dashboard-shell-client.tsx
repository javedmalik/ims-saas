"use client";

import { usePathname } from "next/navigation";

import { Topbar } from "@/components/layout/topbar";

const TITLES: Record<string, string> = {
  "/dashboard": "Dashboard",

  "/pos": "POS Billing",

  "/sales": "Sales Analytics",

  "/purchases": "Purchase & GRN",

  "/reports": "Reports",

  "/stock": "Stock Reports",

  "/products": "Items Master",

  "/suppliers": "Suppliers",

  "/customers": "Customers",

  "/operations": "Operations",

  "/audit": "Audit Log",

  "/users": "Users",

  "/settings": "Settings",
};

export function DashboardShellClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const title = TITLES[pathname] ?? "Dashboard";

  return (
    <>
      <Topbar title={title} />

      <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
    </>
  );
}
