import { z } from "zod";

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable();

export const settingsSchema = z.object({
  legalName: z.string().trim().min(2).max(200),
  tradeName: optionalText(200),
  businessType: optionalText(80),
  pan: z.string().trim().toUpperCase().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, "Invalid PAN").optional().nullable().or(z.literal("")),
  businessEmail: z.string().trim().email().optional().nullable().or(z.literal("")),
  businessPhone: optionalText(30),
  website: optionalText(200),
  currencyCode: z.string().trim().length(3).default("INR"),
  financialYearStartMonth: z.coerce.number().int().min(1).max(12),

  branchName: z.string().trim().min(2).max(150),
  addressLine1: optionalText(200),
  addressLine2: optionalText(200),
  city: optionalText(100),
  state: optionalText(100),
  stateCode: z.string().trim().regex(/^\d{2}$/, "State code must be 2 digits").optional().nullable().or(z.literal("")),
  pincode: z.string().trim().regex(/^\d{6}$/, "PIN code must be 6 digits").optional().nullable().or(z.literal("")),
  branchPhone: optionalText(30),
  branchEmail: z.string().trim().email().optional().nullable().or(z.literal("")),
  gstin: z.string().trim().toUpperCase().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, "Invalid GSTIN").optional().nullable().or(z.literal("")),
  invoicePrefix: z.string().trim().min(1).max(12).regex(/^[A-Za-z0-9\-_/]+$/),
  purchasePrefix: z.string().trim().min(1).max(12).regex(/^[A-Za-z0-9\-_/]+$/),
  creditNotePrefix: z.string().trim().min(1).max(12).regex(/^[A-Za-z0-9\-_/]+$/),
  lowStockGlobal: z.coerce.number().int().min(0).max(999999),
  allowNegativeStock: z.boolean(),
  pricesIncludeTax: z.boolean(),
});

export const branchCreateSchema = z.object({
  code: z.string().trim().min(1).max(30).regex(/^[A-Za-z0-9_-]+$/),
  name: z.string().trim().min(2).max(150),
  city: optionalText(100),
  state: optionalText(100),
  stateCode: z.string().trim().regex(/^\d{2}$/).optional().nullable().or(z.literal("")),
  gstin: z.string().trim().toUpperCase().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/).optional().nullable().or(z.literal("")),
  invoicePrefix: z.string().trim().min(1).max(12).default("INV"),
});
