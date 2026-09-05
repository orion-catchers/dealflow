export class AppError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: Record<string, unknown>) { super(message); }
}
export function requireValue(condition: unknown, message: string): asserts condition { if (!condition) throw new AppError(422, 'VALIDATION', message); }
export function revisionCheck(actual: string, expected: unknown) {
  const a = String(actual ?? "").trim();
  const e = String(expected ?? "").trim();
  const same = a === e || (a.replace(/^r/i, "") !== "" && a.replace(/^r/i, "") === e.replace(/^r/i, ""));
  if (!same) throw new AppError(409, 'STALE_REVISION', 'These terms have changed. Reload and review the current revision.', { currentRevision: actual });
}
