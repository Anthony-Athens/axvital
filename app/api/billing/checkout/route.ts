import {ApiError} from "@/lib/api/validation";
import {withApiGuard} from "@/lib/api/guard";
import {createClient} from "@/lib/supabase/server";
import {createAdminClient} from "@/lib/supabase/admin";
import {appUrl,priceFor} from "@/lib/billing/config";
import {requireUser} from "@/lib/billing/server";
import {stripe} from "@/lib/billing/stripe";
import {authoritativeCustomer} from "@/lib/billing/customer-coordination";
import {customerDependencies} from "@/lib/billing/customer-server";
export const maxDuration=60;
export const POST=withApiGuard("billing/checkout",async request=>{
  const user=await requireUser(await createClient());
  const body=await request.json().catch(()=>({}));
  if(body.interval!=="monthly"&&body.interval!=="annual")throw new ApiError(400,"INVALID_INTERVAL");
  const price=priceFor(body.interval);
  const origin=appUrl();
  const provider=stripe();
  const dependencies=customerDependencies(createAdminClient(),provider);
  const customer=await authoritativeCustomer(user.id,dependencies);
  const session=await provider.checkout.sessions.create({
    mode:"subscription",customer,line_items:[{price:price.priceId,quantity:1}],
    success_url:`${origin}/settings/billing?checkout=success`,
    cancel_url:`${origin}/pricing?checkout=cancelled`,allow_promotion_codes:true,
    client_reference_id:user.id,metadata:{axvital_user_id:user.id,plan:"premium"},
    subscription_data:{metadata:{axvital_user_id:user.id,plan:"premium"}},
  },{timeout:10000,maxNetworkRetries:0});
  // If closing started during the provider call, do not hand out this URL.
  // Stripe customer closure handles an already-open session for that customer.
  await dependencies.assertMapping(user.id,customer);
  return Response.json({url:session.url});
});
