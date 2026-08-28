import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError, validateApiRequest } from "./validation.ts";

/** Authenticated, shared database budget. Never falls back to process-local state. */
export function guardWithClient<T extends Request>(route: string, handler: (request: T, context: { client: SupabaseClient; userId: string }) => Promise<Response>, createClient: () => Promise<SupabaseClient>, options: { budgetRoute?: string } = {}) {
  return async (request: T) => {
    let response: Response;
    try {
      const client = await createClient(), { data, error } = await client.auth.getUser();
      if (error || !data.user) throw new ApiError(401,"AUTH_REQUIRED");
      const experimentAttempt = route.startsWith("http/experiments/");
      if (!experimentAttempt) await validateApiRequest(request, route);
      // Server-selected aliases share an existing budget; never sourced from a request.
      const budget = await client.rpc("axvital_consume_api_budget", { route_key: `${options.budgetRoute ?? route}:${request.method === "HEAD" ? "GET" : request.method}` });
      if (budget.error) throw new ApiError(503,"TEMPORARILY_UNAVAILABLE");
      if (budget.data !== true) throw new ApiError(429,"RATE_LIMITED");
      if (experimentAttempt) await validateApiRequest(request, route);
      response = await handler(request, { client, userId: data.user.id });
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 500;
      response = Response.json({ error: error instanceof ApiError ? error.message : "REQUEST_FAILED" }, { status });
    }
    response.headers.set("Cache-Control","private, no-store");
    if (response.status === 429) response.headers.set("Retry-After","60");
    if (response.status >= 500) console.error("api.request_failed", { route, status: response.status, category: "operation_failed" });
    return response;
  };
}
