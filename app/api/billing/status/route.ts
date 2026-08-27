import { withApiGuard } from "@/lib/api/guard";
import{createClient}from"@/lib/supabase/server";import{getSubscription,requireUser}from"@/lib/billing/server";import{entitlementState,subscriptionFromRow}from"@/lib/billing/entitlements";
async function handleGET(){try{const client=await createClient(),user=await requireUser(client),row=await getSubscription(client,user.id),state=subscriptionFromRow(row);return Response.json({plan:state?.plan??"free",status:state?.status??"inactive",entitlementState:entitlementState(state),currentPeriodEnd:state?.currentPeriodEnd??null,cancelAtPeriodEnd:state?.cancelAtPeriodEnd??false,priceId:row?.stripe_price_id??null},{headers:{"Cache-Control":"private, no-store"}})}catch(error){return Response.json({error:"AUTH_REQUIRED"},{status:error instanceof Error&&error.message==="AUTH_REQUIRED"?401:500})}}

export const GET = withApiGuard("billing/status", handleGET);
