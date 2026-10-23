import { z } from "zod";

export const userSchema = z.object({
  username: z.string().trim().min(3).max(50).regex(/^[A-Za-z0-9._-]+$/),
  fullName: z.string().trim().min(2).max(100),
  password: z.string().min(8).max(100).optional().or(z.literal("")),
  role: z.enum(["ADMIN", "MANAGER", "STAFF", "CASHIER"]),
  defaultBranchId: z.coerce.number().int().positive(),
  branchIds: z.array(z.coerce.number().int().positive()).default([]),
  isActive: z.boolean().default(true),
}).superRefine((value, ctx) => {
  if (value.branchIds.length && !value.branchIds.includes(value.defaultBranchId)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["branchIds"], message: "Default branch must be included in branch access." });
  }
});
