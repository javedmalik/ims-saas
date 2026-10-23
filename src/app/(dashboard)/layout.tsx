import { Sidebar } from "@/components/layout/sidebar";
import { DashboardShellClient } from "@/components/layout/dashboard-shell-client";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <DashboardShellClient>{children}</DashboardShellClient>
      </div>
    </div>
  );
}
