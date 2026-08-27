import { withApiGuard } from "@/lib/api/guard";
import { createClient } from "@/lib/supabase/server";
import { exportAccount } from "@/lib/account/service";
export const maxDuration = 30;
export const POST = withApiGuard("account/export", async () => {
  const payload = await exportAccount(await createClient());
  return new Response(payload, { headers: {
    "Content-Type":"application/json; charset=utf-8",
    "Content-Disposition":'attachment; filename="axvital-account-export.json"',
    "X-Content-Type-Options":"nosniff",
  }});
});
