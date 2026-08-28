import { ApiError } from "../api/validation.ts";
const codes: Record<string, number> = {
  AUTH_REQUIRED: 401, PREMIUM_REQUIRED: 403, RATE_LIMITED: 429,
  EXPERIMENT_NOT_FOUND: 404, TARGET_NOT_FOUND: 404,
  REVISION_CONFLICT: 409, STARTED_CONFIGURATION_IMMUTABLE: 409, INVALID_TRANSITION: 409,
  EXPERIMENT_CONFIGURATION_INCOMPLETE: 409, START_DATE_MUST_BE_TODAY: 409,
  EMPTY_PROTOCOL: 409, EMPTY_WORKOUT_TEMPLATE: 409, EMPTY_PATTERN: 409, QUESTION_REQUIRED: 409,
  CONFIGURATION_TOO_LARGE: 413,
};
const invalid = new Set(["INVALID_REQUEST", "INVALID_DRAFT", "INVALID_HYPOTHESIS", "INVALID_QUESTION", "INVALID_TIME_ZONE", "INVALID_BASELINE_MODE", "INVALID_DATE", "INVALID_DATES", "INVALID_OUTCOMES", "INVALID_OUTCOME", "INVALID_CRITERION", "INVALID_REVISION", "INVALID_TARGET", "INVALID_INTERVENTION", "INVALID_WINDOW", "UNSUPPORTED_SOURCE", "NONEXISTENT_LOCAL_DATE", "WINDOW_TOO_LARGE", "FUTURE_WINDOW"]);
/** Exact allowlist: never reflect database messages, details or constraint names. */
export function experimentError(error: unknown, rpc = false): ApiError {
  if (error instanceof ApiError) return error;
  const message = error instanceof Error ? error.message : typeof error === "object" && error !== null && "message" in error ? String(error.message) : "";
  if (rpc && ["INVALID_TARGET", "INVALID_INTERVENTION"].includes(message)) return new ApiError(404, "TARGET_NOT_FOUND");
  if (codes[message]) return new ApiError(codes[message], message);
  if (invalid.has(message)) return new ApiError(400, "INVALID_CONFIGURATION");
  if (rpc && typeof error === "object" && error !== null && "code" in error && ["23514", "22007", "22008", "22P02", "22003"].includes(String(error.code))) return new ApiError(400, "INVALID_CONFIGURATION");
  return new ApiError(503, "TEMPORARILY_UNAVAILABLE");
}
