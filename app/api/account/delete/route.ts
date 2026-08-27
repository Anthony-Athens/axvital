import { withApiGuard } from "@/lib/api/guard";
import { ApiError } from "@/lib/api/validation";
import { createClient } from "@/lib/supabase/server";
import { deleteAccount } from "@/lib/account/service";
import { deletionDependencies } from "@/lib/account/deletion-server";
export const maxDuration = 60;
export const POST = withApiGuard("account/delete", async request => {
  // Owner enables only after verifying deployed schema, storage and Stripe Test Mode.
  if (process.env.AXVITAL_ACCOUNT_DELETION_ENABLED !== "true") throw new ApiError(503,"DELETION_UNAVAILABLE");
  const client = await createClient();
  await deleteAccount(client, await request.json(), deletionDependencies(client));
  // Auth user is gone. Cookie cleanup can be retried client-side; never report a
  // completed destructive operation as failed solely because logout failed.
  await client.auth.signOut({scope:"local"}).catch(() => {});
  return Response.json({deleted:true});
});
