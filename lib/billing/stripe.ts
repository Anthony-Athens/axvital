import "server-only";import Stripe from"stripe";
let instance:Stripe|null=null;export function stripe(){const key=process.env.STRIPE_SECRET_KEY;if(!key)throw new Error("BILLING_NOT_CONFIGURED");return instance??=new Stripe(key)}
