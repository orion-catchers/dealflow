import type { HealthFlagType as ContractFlagType } from "@/contracts/atharva";
import type { HealthFlagType as DbFlagType } from "@/generated/prisma/client";

export function toDbFlagType(type: ContractFlagType): DbFlagType {
  return type === "STALLED_QUOTE" ? "STALLED" : type;
}

export function toContractFlagType(type: DbFlagType): ContractFlagType {
  return type === "STALLED" ? "STALLED_QUOTE" : type;
}
