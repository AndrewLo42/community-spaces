import { TRPCClientError } from "@trpc/client";

/** Per-field messages from a tRPC validation error, if any. */
export function fieldErrors(error: unknown): Record<string, string | undefined> {
  if (!(error instanceof TRPCClientError)) return {};
  const errors = (error.data as { fieldErrors?: Record<string, string[]> } | undefined)?.fieldErrors;
  if (!errors) return {};
  return Object.fromEntries(Object.entries(errors).map(([k, v]) => [k, v?.[0]]));
}

/** A sentence to show the user. Validation failures point at the fields; anything else says what the server said. */
export function errorMessage(error: unknown): string | null {
  if (!error) return null;
  if (Object.keys(fieldErrors(error)).length > 0) return "Please fix the highlighted fields.";
  return error instanceof Error ? error.message : "Something went wrong";
}
