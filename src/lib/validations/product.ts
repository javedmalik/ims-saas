import { z } from "zod";

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));

export const productSchema = z.object({
  name: z.string().trim().min(2, "Product name is required").max(200),
  sku: optionalText(50),
  brand: optionalText(200),
  variant: optionalText(200),
  category: optionalText(100),
  unit: z.string().trim().min(1).max(20).default("pcs"),
  hsnCode: optionalText(20),
  defaultTaxPercent: z.coerce.number().min(0).max(100).default(0),
  reorderLevel: z.coerce.number().int().min(0).max(100000000).default(0),
  isActive: z.boolean().default(true),
});

export type ProductInput = z.infer<typeof productSchema>;
