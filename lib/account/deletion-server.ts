import "server-only";
import {closeMappedBilling} from "./close-billing";
import { createClient as createIsolatedClient, type SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { createAdminClient } from "../supabase/admin";
import { ApiError } from "../api/validation";
import type { DeletionDependencies } from "./service";

export function deletionDependencies(client: SupabaseClient): DeletionDependencies {
  const admin = createAdminClient();
  return {
    async verifyPassword(user, password) {
      if (!user.email) return false;
      if (user.factors?.some(factor => factor.status === "verified")) {
        const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel();
        if (assurance.error || assurance.data.currentLevel !== "aal2") return false;
      }
      // Never install this short-lived verification session in the user's cookies.
      const verifier = createIsolatedClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        auth: { persistSession:false, autoRefreshToken:false, detectSessionInUrl:false },
        global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10000) }) },
      });
      const result = await verifier.auth.signInWithPassword({ email:user.email, password });
      try { return !result.error && result.data.user?.id === user.id; }
      finally { if (result.data.session) await verifier.auth.signOut({scope:"local"}).catch(() => {}); }
    },
    async begin(userId) {
      const { error } = await admin.rpc("axvital_begin_account_deletion", {target_user:userId});
      if (error) throw new ApiError(503,"DELETION_FAILED");
    },
    async closeBilling(userId) {
      const { data, error } = await admin.from("subscriptions").select("stripe_customer_id,stripe_subscription_id,status").eq("user_id",userId).maybeSingle();
      if (error) throw new ApiError(503,"BILLING_CLOSE_FAILED");
      await closeMappedBilling(data,()=>{
        if (!process.env.STRIPE_SECRET_KEY) throw new Error("BILLING_NOT_CONFIGURED");
        const provider = new Stripe(process.env.STRIPE_SECRET_KEY,{timeout:10000,maxNetworkRetries:0});
        return {retrieve:async id=>{const customer=await provider.customers.retrieve(id);return {id:customer.id,deleted:customer.deleted===true}},remove:id=>provider.customers.del(id)};
      });
    },
    async markBillingClosed(userId) {
      const { data, error } = await admin.from("account_deletions").update({billing_closed:true}).eq("user_id",userId).select("user_id").single();
      if (error || !data) throw new ApiError(503,"DELETION_FAILED");
    },
    async deleteAuth(userId) {
      const { error } = await admin.auth.admin.deleteUser(userId, false);
      if (error) throw new ApiError(503,"DELETION_FAILED");
    },
  };
}
