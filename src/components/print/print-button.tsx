"use client";

import {
  ArrowLeft,
  Printer,
} from "lucide-react";

import {
  useRouter,
} from "next/navigation";

import {
  Button,
} from "@/components/ui/button";

export function PrintButton() {
  const router =
    useRouter();

  return (
    <div
      className="mb-5 flex justify-between gap-2 print:hidden"
      data-no-print
    >
      <Button
        type="button"
        variant="outline"
        onClick={() =>
          router.back()
        }
      >
        <ArrowLeft className="mr-2 h-4 w-4" />

        Back
      </Button>

      <Button
        type="button"
        onClick={() =>
          window.print()
        }
      >
        <Printer className="mr-2 h-4 w-4" />

        Print
      </Button>
    </div>
  );
}