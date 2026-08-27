import {ApiError} from "../api/validation.ts";
export type BillingMapping={stripe_customer_id:string|null;stripe_subscription_id:string|null;status:string};
export type CustomerClosure={retrieve:(id:string)=>Promise<{id:string;deleted?:boolean}>;remove:(id:string)=>Promise<{id:string;deleted:boolean}>};
/** Provider wiring stays server-only; this contract is independently testable. */
export async function closeMappedBilling(mapping:BillingMapping|null,provider:()=>CustomerClosure){
  if(!mapping)return;
  if(!mapping.stripe_customer_id){
    if(mapping.stripe_subscription_id||!["inactive","canceled","incomplete_expired"].includes(mapping.status))throw new ApiError(409,"BILLING_REVIEW_REQUIRED");
    return;
  }
  try{
    const client=provider();
    const customer=await client.retrieve(mapping.stripe_customer_id);
    if(customer.id!==mapping.stripe_customer_id)throw new Error("CUSTOMER_MISMATCH");
    if(customer.deleted)return;
    const result=await client.remove(customer.id);
    if(!result.deleted||result.id!==customer.id)throw new Error("CUSTOMER_NOT_CLOSED");
  }catch{throw new ApiError(503,"BILLING_CLOSE_FAILED")}
}
