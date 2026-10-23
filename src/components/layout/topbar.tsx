"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { Building2, ChevronDown, LogOut, Menu, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type BranchOption = {
  id: number;
  name: string;
  code: string;
  businessId: number;
  businessName: string;
  role: string;
  current: boolean;
};

export function Topbar({ title }: { title: string }) {
  const router = useRouter();
  const { data: session, update } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    if (!session?.user?.id) return;
    fetch("/api/session/branches", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setBranches(Array.isArray(d) ? d : []))
      .catch(() => setBranches([]));
  }, [session?.user?.id, session?.user?.branchId]);

  async function switchBranch(branchId: number) {
    if (branchId === session?.user?.branchId) return;
    setSwitching(true);
    await update({ branchId });
    router.refresh();
    setSwitching(false);
  }

  return (
    <header className="flex min-h-16 items-center justify-between border-b border-border bg-card px-4 py-2 md:px-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
          <p className="hidden text-xs text-muted-foreground sm:block">
            {session?.user?.businessName} · {session?.user?.branchName}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {branches.length > 1 && (
          <div className="hidden items-center gap-2 md:flex">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <select
              value={session?.user?.branchId ?? ""}
              disabled={switching}
              onChange={(e) => switchBranch(Number(e.target.value))}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              aria-label="Switch branch"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.code})
                </option>
              ))}
            </select>
            {switching && <RefreshCw className="h-4 w-4 animate-spin" />}
          </div>
        )}

        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-secondary"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              {session?.user?.name?.slice(0, 1).toUpperCase() ?? "?"}
            </span>
            <span className="hidden text-left sm:block">
              <span className="block text-sm font-medium leading-tight">{session?.user?.name}</span>
              <span className="block text-xs capitalize leading-tight text-muted-foreground">
                {session?.user?.role?.toLowerCase()}
              </span>
            </span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </button>
          {menuOpen && (
            <div role="menu" className="absolute right-0 top-full z-20 mt-1 w-48 rounded-md border border-border bg-card p-1 shadow-md">
              {branches.length > 1 && (
                <div className="border-b p-2 md:hidden">
                  <p className="mb-1 text-xs font-medium text-muted-foreground">Branch</p>
                  <select
                    value={session?.user?.branchId ?? ""}
                    disabled={switching}
                    onChange={(e) => switchBranch(Number(e.target.value))}
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <button
                role="menuitem"
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-destructive hover:bg-secondary"
              >
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
