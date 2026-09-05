import { z } from "zod";
import type { ApprovalListFilter } from "@/contracts/ruchir";
import { ApiFailure } from "@/lib/api/respond";

export const approvalListFilterSchema = z.enum(["PENDING", "RETURNED", "COMPLETED", "ALL"] satisfies [
  ApprovalListFilter,
  ...ApprovalListFilter[],
]);

export function parseApprovalListFilter(searchParams: URLSearchParams): ApprovalListFilter {
  const raw = searchParams.get("status") ?? "PENDING";
  const result = approvalListFilterSchema.safeParse(raw);
  if (!result.success) {
    throw new ApiFailure("INVALID_INPUT", `Invalid status filter '${raw}'`, result.error.issues);
  }
  return result.data;
}

export const approvalActionBodySchema = z.object({
  decision: z.enum(["APPROVE", "REJECT", "RETURN"]),
  reason: z.string().trim().min(1, "Reason is required"),
});

export type ApprovalActionBody = z.infer<typeof approvalActionBodySchema>;

export function parseApprovalActionBody(raw: unknown): ApprovalActionBody {
  const result = approvalActionBodySchema.safeParse(raw);
  if (!result.success) {
    throw new ApiFailure("INVALID_INPUT", "Invalid approval action", result.error.issues);
  }
  return result.data;
}
