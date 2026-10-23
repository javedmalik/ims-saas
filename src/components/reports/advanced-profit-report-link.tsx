"use client";

import { Button } from "@/components/ui/button";

export function AdvancedProfitReportLink() {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => {
        window.location.href = "/reports/profit";
      }}
    >
      Profit Reports
    </Button>
  );
}
