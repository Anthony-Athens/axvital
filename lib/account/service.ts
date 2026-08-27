import type { SupabaseClient, User } from "@supabase/supabase-js";
import { ApiError } from "../api/validation.ts";

export async function exportAccount(client: SupabaseClient) {
  const { data: auth, error } = await client.auth.getUser();
  if (error || !auth.user) throw new ApiError(401,"AUTH_REQUIRED");
  const result = await client.rpc("axvital_export_account").abortSignal(AbortSignal.timeout(15000));
  if (result.error || !result.data) throw new ApiError(503,"EXPORT_FAILED");
  const serialized = JSON.stringify(result.data);
  if (new TextEncoder().encode(serialized).byteLength > 4 * 1024 * 1024) throw new ApiError(413,"EXPORT_TOO_LARGE");
  return serialized;
}
export type DeletionDependencies = {
  verifyPassword: (user: User, password: string) => Promise<boolean>;
  begin: (userId: string) => Promise<void>;
  closeBilling: (userId: string) => Promise<void>;
  markBillingClosed: (userId: string) => Promise<void>;
  deleteAuth: (userId: string) => Promise<void>;
};
/** There is intentionally no client owner/id argument. Retry after failure uses the same durable request. */
export async function deleteAccount(client: SupabaseClient, body: unknown, dependencies: DeletionDependencies) {
  const { data: auth, error } = await client.auth.getUser();
  if (error || !auth.user) throw new ApiError(401,"AUTH_REQUIRED");
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError(400,"CONFIRMATION_REQUIRED");
  const fields = body as Record<string, unknown>;
  if (Object.keys(fields).some(key => !["confirmation","password","acceptConsequences"].includes(key)) || fields.confirmation !== "DELETE" || fields.acceptConsequences !== true || typeof fields.password !== "string" || !fields.password || fields.password.length > 1024) throw new ApiError(400,"CONFIRMATION_REQUIRED");
  if (!await dependencies.verifyPassword(auth.user, fields.password)) throw new ApiError(403,"REAUTH_REQUIRED");
  await dependencies.begin(auth.user.id);
  await dependencies.closeBilling(auth.user.id);
  await dependencies.markBillingClosed(auth.user.id);
  // Admin Auth deletion invokes the database cleanup trigger atomically. Never
  // separately delete application rows from JavaScript before this operation.
  await dependencies.deleteAuth(auth.user.id);
}
