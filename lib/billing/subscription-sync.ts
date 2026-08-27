import type Stripe from "stripe";
import type {SupabaseClient} from "@supabase/supabase-js";
const iso=(seconds:number|null|undefined)=>seconds?new Date(seconds*1000).toISOString():null;
export function subscriptionRecord(subscription:Stripe.Subscription,userId:string){const item=subscription.items.data[0],status=subscription.status==="active"||subscription.status==="trialing"||subscription.status==="past_due"||subscription.status==="canceled"||subscription.status==="incomplete"||subscription.status==="incomplete_expired"||subscription.status==="unpaid"||subscription.status==="paused"?subscription.status:"inactive";return{user_id:userId,stripe_customer_id:typeof subscription.customer==="string"?subscription.customer:subscription.customer.id,stripe_subscription_id:subscription.id,plan:"premium",status,stripe_price_id:item?.price.id??null,current_period_start:iso(item?.current_period_start),current_period_end:iso(item?.current_period_end),cancel_at_period_end:subscription.cancel_at_period_end,trial_start:iso(subscription.trial_start),trial_end:iso(subscription.trial_end)}}

/** Server wrapper supplies the privileged client. Metadata is a consistency hint,
 * never authority to create or replace a customer mapping. */
export async function syncSubscription(admin:SupabaseClient,subscription:Stripe.Subscription,userId?:string|null){
  const customer=typeof subscription.customer==="string"?subscription.customer:subscription.customer.id;
  const metadataOwner=subscription.metadata.axvital_user_id;
  if(userId&&metadataOwner&&userId!==metadataOwner)throw new Error("BILLING_OWNER_CONFLICT");
  const hint=userId||metadataOwner||null;
  const mapping=await admin.from("subscriptions").select("user_id").eq("stripe_customer_id",customer).maybeSingle();
  if(mapping.error)throw new Error("BILLING_MAPPING_LOOKUP_FAILED");
  const owner=mapping.data?.user_id??hint;
  if(!owner)throw new Error("BILLING_MAPPING_MISSING");
  if(hint&&owner!==hint)throw new Error("BILLING_OWNER_CONFLICT");
  const account=await admin.auth.admin.getUserById(owner);
  if(account.error){if(account.error.status===404)return;throw new Error("ACCOUNT_LOOKUP_FAILED")}
  if(!account.data.user)return;
  const closing=await admin.from("account_deletions").select("user_id").eq("user_id",owner).maybeSingle();
  if(closing.error)throw new Error("ACCOUNT_LOOKUP_FAILED");
  if(closing.data)return;
  if(!mapping.data)throw new Error("BILLING_MAPPING_MISSING");
  // Never upsert: deleted accounts and unmapped customer events must not create
  // a projection. Immutable mapping and closing triggers also cover this write.
  const {data,error}=await admin.from("subscriptions").update(subscriptionRecord(subscription,owner))
    .eq("user_id",owner).eq("stripe_customer_id",customer).select("user_id").maybeSingle();
  if(error||!data)throw new Error("BILLING_SYNC_FAILED");
}
