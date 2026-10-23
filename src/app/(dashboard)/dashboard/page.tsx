"use client";

import { useEffect, useState } from "react";
import {
  IndianRupee,
  Receipt,
  Package,
  AlertTriangle,
  CalendarClock,
  TrendingUp,
} from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/utils";

type Summary = {
  todaySales: number;
  monthSales: number;
  billsToday: number;
  totalProducts: number;
  lowStockCount: number;
  nearExpiryCount: number;
  currencyCode: string;
  recentSales: Array<{
    id: string;
    billNo: string;
    billDateTime: string;
    netAmount: number;
    customerName: string;
  }>;
};

export default function DashboardPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/dashboard/summary")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load dashboard data");
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setSummary(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }

  if (!summary) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg bg-secondary" />
        ))}
      </div>
    );
  }

  const currency = summary.currencyCode;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Today's sales"
          value={formatCurrency(summary.todaySales, currency)}
          icon={IndianRupee}
          tone="success"
        />
        <StatCard
          label="This month's sales"
          value={formatCurrency(summary.monthSales, currency)}
          icon={TrendingUp}
        />
        <StatCard label="Bills today" value={String(summary.billsToday)} icon={Receipt} />
        <StatCard label="Active products" value={String(summary.totalProducts)} icon={Package} />
        <StatCard
          label="Low stock items"
          value={String(summary.lowStockCount)}
          icon={AlertTriangle}
          tone={summary.lowStockCount > 0 ? "warning" : "default"}
        />
        <StatCard
          label="Expiring within 90 days"
          value={String(summary.nearExpiryCount)}
          icon={CalendarClock}
          tone={summary.nearExpiryCount > 0 ? "destructive" : "default"}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent sales</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {summary.recentSales.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-muted-foreground">
              No sales recorded yet. They&apos;ll show up here as soon as you bill from POS.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-t border-border text-left text-muted-foreground">
                    <th className="px-5 py-2 font-medium">Bill No</th>
                    <th className="px-5 py-2 font-medium">Customer</th>
                    <th className="px-5 py-2 font-medium">Date</th>
                    <th className="px-5 py-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.recentSales.map((sale) => (
                    <tr key={sale.id} className="border-t border-border">
                      <td className="px-5 py-2.5 font-medium">{sale.billNo}</td>
                      <td className="px-5 py-2.5 text-muted-foreground">{sale.customerName}</td>
                      <td className="px-5 py-2.5 text-muted-foreground">
                        {formatDate(sale.billDateTime)}
                      </td>
                      <td className="px-5 py-2.5 text-right tabular-nums">
                        {formatCurrency(sale.netAmount, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
