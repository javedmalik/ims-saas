import { z } from "zod";

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable();

export const supplierSchema = z.object({
  name: z.string().trim().min(2).max(200),
  contactPerson: optionalText(150), mobile: optionalText(20), phone: optionalText(20),
  taxId: optionalText(20), addressLine1: optionalText(200), addressLine2: optionalText(200),
  city: optionalText(100), state: optionalText(100),
  stateCode: z.string().trim().regex(/^\d{2}$/).optional().nullable().or(z.literal("")), pincode: optionalText(10),
  isActive: z.boolean().default(true),
});

export const customerSchema = z.object({
  name: z.string().trim().min(2).max(200), mobile: optionalText(20), address: optionalText(300),
  referredBy: optionalText(200), taxId: optionalText(20), state: optionalText(100),
  stateCode: z.string().trim().regex(/^\d{2}$/).optional().nullable().or(z.literal("")),
  isActive: z.boolean().default(true),
});
