
"use client";

import { Button } from "@/components/ui/button";

export function InventoryAnalysisReportLink() {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => {
        window.location.href =
          "/reports/inventory-analysis";
      }}
    >
      Inventory Analysis
    </Button>
  );
}
