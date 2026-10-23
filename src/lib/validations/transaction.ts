import { z } from "zod";

export const paymentSchema = z.object({
  mode: z.enum([
    "CASH",
    "CARD",
    "UPI",
    "BANK_TRANSFER",
    "CREDIT",
    "OTHER",
  ]),

  amount: z.coerce
    .number()
    .positive("Payment amount must be greater than zero"),

  reference: z
    .string()
    .trim()
    .max(100)
    .optional()
    .nullable(),
});

const purchaseItemSchema = z.object({
  productId: z.coerce
    .number()
    .int()
    .positive(),

  batchNo: z
    .string()
    .trim()
    .min(1, "Batch number is required")
    .max(50),

  expiryDate: z
    .string()
    .optional()
    .nullable(),

  qty: z.coerce
    .number()
    .int()
    .positive(),

  freeQty: z.coerce
    .number()
    .int()
    .min(0)
    .default(0),

  mrp: z.coerce
    .number()
    .nonnegative(),

  costPrice: z.coerce
    .number()
    .nonnegative(),

  sellPrice: z.coerce
    .number()
    .nonnegative(),

  discountPercent: z.coerce
    .number()
    .min(0)
    .max(100)
    .default(0),

  taxPercent: z.coerce
    .number()
    .min(0)
    .max(100)
    .default(0),
});

export const purchaseSchema = z
  .object({
    supplierId: z.coerce
      .number()
      .int()
      .positive(),

    invoiceNo: z
      .string()
      .trim()
      .min(1)
      .max(50),

    invoiceDate: z
      .string()
      .min(8),

    items: z
      .array(purchaseItemSchema)
      .min(1, "At least one purchase item is required"),

    payments: z
      .array(paymentSchema)
      .default([]),
  })
  .superRefine((data, ctx) => {
    const seen = new Set<string>();

    data.items.forEach((item, index) => {
      const key = `${item.productId}:${item.batchNo.toLowerCase()}`;

      if (seen.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["items", index, "batchNo"],
          message:
            "The same product and batch cannot be entered twice",
        });
      }

      seen.add(key);
    });
  });

const saleItemSchema = z.object({
  batchId: z.coerce
    .number()
    .int()
    .positive(),

  qty: z.coerce
    .number()
    .int()
    .positive(),

  rate: z.coerce
    .number()
    .nonnegative()
    .optional(),

  discountPercent: z.coerce
    .number()
    .min(0)
    .max(100)
    .default(0),
});

export const saleSchema = z
  .object({
    customerId: z.coerce
      .number()
      .int()
      .positive()
      .optional()
      .nullable(),

    items: z
      .array(saleItemSchema)
      .min(1, "At least one sale item is required"),

    payments: z
      .array(paymentSchema)
      .min(1, "At least one payment is required"),
  })
  .superRefine((data, ctx) => {
    const seen = new Set<number>();

    data.items.forEach((item, index) => {
      if (seen.has(item.batchId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["items", index, "batchId"],
          message:
            "The same batch cannot be added twice",
        });
      }

      seen.add(item.batchId);
    });
  });