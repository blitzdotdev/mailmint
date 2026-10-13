/** Every API error is `{ error: { code, message } }` with one of these codes. */
export type ErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "invalid_request"
  | "unknown_field"
  | "address_taken"
  | "invalid_address"
  | "domain_not_allowed"
  | "rate_limited"
  | "payload_too_large"
  | "internal";

export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  constructor(status: number, code: ErrorCode, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export function errorBody(code: ErrorCode, message: string) {
  return { error: { code, message } };
}
