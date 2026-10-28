import type { ApiErrorCode } from "@/contracts/harsh";

/** Envelope error thrown by services and shared input schemas; `handle()` turns it into `{error:{code,message,details}}`. */
export class ApiFailure extends Error {
  constructor(
    public code: ApiErrorCode,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiFailure";
  }
}
