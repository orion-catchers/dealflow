import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

/** Public sign-up creates a new workspace; people join an existing workspace only by an admin's invitation. */
export const signupSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8),
  name: z.string().trim().min(1).max(200),
  companyName: z.string().trim().min(2).max(120),
  currency: z.enum(["INR", "USD", "EUR"]).optional(),
});

/** The DEV FIXTURE adapter keeps its original request-access sign-up, which has no company. */
export const fixtureSignupSchema = signupSchema.pick({ email: true, password: true, name: true });

export const userInviteSchema = z.object({
  email: z.string().trim().email(),
  name: z.string().trim().min(1).max(200),
  role: z.enum(["ADMIN", "SALES_REP", "SALES_MANAGER", "FINANCE", "CUSTOMER"]),
  teamId: z.string().trim().min(1).nullable().optional(),
  customerIds: z.array(z.string().trim().min(1)).optional(),
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
