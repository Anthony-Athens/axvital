import { withApiGuard } from "@/lib/api/guard";
import{createClient}from"@/lib/supabase/server";import{appUrl}from"@/lib/billing/config";import{getSubscription,requireUser}from"@/lib/billing/server";import{stripe}from"@/lib/billing/stripe";
async function handlePOST(){try{const client=await createClient(),user=await requireUser(client),subscription=await getSubscription(client,user.id);if(!subscription?.stripe_customer_id)return Response.json({error:"NO_BILLING_ACCOUNT"},{status:400});const session=await stripe().billingPortal.sessions.create({customer:subscription.stripe_customer_id,return_url:`${appUrl()}/settings/billing?portal=returned`});return Response.json({url:session.url})}catch(error){return Response.json({error:error instanceof Error&&error.message==="AUTH_REQUIRED"?"AUTH_REQUIRED":"PORTAL_FAILED"},{status:error instanceof Error&&error.message==="AUTH_REQUIRED"?401:500})}}

export const POST = withApiGuard("billing/portal", handlePOST);
