import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { guardWithClient } from "../api/boundary.ts";
import { ApiError } from "../api/validation.ts";
import { hasEntitlement, subscriptionFromRow } from "../billing/entitlements.ts";
import { exactKeys, isObject, isUuid } from "../rules/validation.ts";
import { validateV2Draft } from "./v2.ts";
import { discoverOutcomes } from "./discovery.ts";
import { discoverTargets } from "./targets.ts";
import { loadDraft, ownedExperiment, publicExperiment } from "./draft-read.ts";
import { getBaselineReadiness } from "./readiness.ts";
import type { SourceRequest } from "../measurements/sources/index.ts";
import { experimentError } from "./api-errors.ts";
type Action = "outcomes" | "targets" | "draft" | "readiness" | "start";
async function requirePremium(client: SupabaseClient, owner: string) {
  const { data, error } = await client.from("subscriptions").select("plan,status,current_period_end,cancel_at_period_end").eq("user_id", owner).limit(1).abortSignal(AbortSignal.timeout(10000)).maybeSingle();
  if (error) throw new ApiError(503, "TEMPORARILY_UNAVAILABLE");
  // Match authoritative DB projection even in local development; no bypass here.
  if (!hasEntitlement(subscriptionFromRow(data), "full_experiments", { NODE_ENV: "production" })) throw new ApiError(403, "PREMIUM_REQUIRED");
}
export function experimentApi(action: Action, createClient: () => Promise<SupabaseClient>) {
  return guardWithClient(`http/experiments/${action}`, async (request, { client, userId }) => {
    try {
      const params = new URL(request.url).searchParams;
      if (action === "outcomes") return Response.json(discoverOutcomes());
      if (action === "targets") return Response.json(await discoverTargets(client, params));
      if (action === "draft" && (request.method === "GET" || request.method === "HEAD")) {
        const id = params.get("id");if (!isUuid(id)) throw new ApiError(400, "INVALID_REQUEST");
        return Response.json(await loadDraft(client, userId, id));
      }
      await requirePremium(client, userId);
      const body: unknown = await request.json();
      if (action === "readiness") {
        const readiness = await getBaselineReadiness(client, body as SourceRequest);
        return Response.json(readiness, { status: readiness.queryCompleteness === "complete" ? 200 : 503 });
      }
      if (!isObject(body) || !exactKeys(body, action === "draft" ? ["id", "revision", "input"] : ["id", "revision"]) || (body.id !== null && !isUuid(body.id)) || !Number.isSafeInteger(body.revision) || (body.revision as number) < (body.id === null ? 0 : 1) || (body.revision as number) > 2147483647) throw new ApiError(400, "INVALID_REQUEST");
      if (action === "draft") {
        validateV2Draft(body.input);
        const { data, error } = await client.rpc("save_experiment_v2", { target_id: body.id, expected_revision: body.revision, input: body.input }).abortSignal(AbortSignal.timeout(10000));
        if (error) throw experimentError(error, true);
        if (!data) throw new ApiError(503, "TEMPORARILY_UNAVAILABLE");
        return Response.json({ experiment: publicExperiment(data), creationRetryIdempotent: false }, { status: body.id === null ? 201 : 200 });
      }
      if (!isUuid(body.id)) throw new ApiError(400, "INVALID_REQUEST");
      const current = await ownedExperiment(client, userId, body.id);
      if (current.config_revision !== body.revision) throw new ApiError(409, "REVISION_CONFLICT");
      if (current.baseline_mode === "prospective") throw new ApiError(409, "PROSPECTIVE_RUNTIME_UNAVAILABLE");
      const { data, error } = await client.rpc("start_experiment_v2", { target_id: body.id, expected_revision: body.revision }).abortSignal(AbortSignal.timeout(10000));
      if (error) throw experimentError(error, true);
      if (!data) throw new ApiError(503, "TEMPORARILY_UNAVAILABLE");
      return Response.json({ experiment: publicExperiment(data), startSnapshotIsAuthoritative: true, readinessIsPreview: true });
    } catch (error) { throw experimentError(error); }
  }, createClient);
}
