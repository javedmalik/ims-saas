"use client";

import { Button } from "@/components/ui/button";

export function AdvancedOperationsReportLink() {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => {
        window.location.href =
          "/reports/advanced";
      }}
    >
      Advanced Reports
    </Button>
  );
}
