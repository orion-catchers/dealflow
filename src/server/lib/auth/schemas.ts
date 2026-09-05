import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export const signupSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8),
  name: z.string().trim().min(1).max(200),
  customerId: z.string().trim().min(1).optional(),
});

export const userPatchSchema = z.object({
  status: z.enum(["PENDING", "ACTIVE", "DISABLED"]).optional(),
  role: z.enum(["ADMIN", "SALES_REP", "SALES_MANAGER", "FINANCE", "CUSTOMER"]).optional(),
  teamId: z.string().trim().min(1).nullable().optional(),
  customerIds: z.array(z.string().trim().min(1)).optional(),
});

export const passwordResetRequestSchema = z.object({
  email: z.string().trim().email(),
});

export const passwordResetConfirmSchema = z.object({
  token: z.string().trim().min(16).max(128),
  newPassword: z.string().min(8),
});
