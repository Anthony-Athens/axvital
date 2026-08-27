import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";
import type Stripe from "stripe";
import {ApiError} from "../api/validation";
import type {CustomerDependencies,CustomerReservation} from "./customer-coordination";

const conflicts=new Set(["ACCOUNT_NOT_FOUND","ACCOUNT_DELETION_PENDING","BILLING_RECONCILIATION_REQUIRED","BILLING_MAPPING_CONFLICT","BILLING_OPERATION_MISMATCH"]);
export function customerDependencies(admin:SupabaseClient,provider:Stripe):CustomerDependencies {
  async function rpc(name:string,args:Record<string,string>) {
    const {data,error}=await admin.rpc(name,args).abortSignal(AbortSignal.timeout(10000));
    if(error)throw new ApiError(conflicts.has(error.message)?409:503,conflicts.has(error.message)?error.message:"BILLING_COORDINATION_FAILED");
    return data;
  }
  return {
    reserve:async owner=>{
      const data=await rpc("axvital_reserve_billing_customer",{target_user:owner});
      if(!data||!(typeof data.customer_id==="string"||typeof data.operation_id==="string"&&typeof data.retry_before==="string"))throw new ApiError(503,"BILLING_COORDINATION_FAILED");
      return data as CustomerReservation;
    },
    create:async(owner,key)=>{
      try {
        const customer=await provider.customers.create({metadata:{axvital_user_id:owner}}, {idempotencyKey:key,timeout:10000,maxNetworkRetries:0});
        return {id:customer.id,owner:customer.metadata.axvital_user_id};
      } catch {throw new ApiError(503,"BILLING_CUSTOMER_PENDING");}
    },
    retrieve:async id=>{
      try {
        const customer=await provider.customers.retrieve(id,{},{timeout:10000,maxNetworkRetries:0});
        return {id:customer.id,deleted:customer.deleted===true,owner:customer.deleted?undefined:customer.metadata.axvital_user_id};
      } catch {throw new ApiError(503,"BILLING_CUSTOMER_UNAVAILABLE");}
    },
    establish:async(owner,operation,customer)=>{
      const data=await rpc("axvital_establish_billing_customer",{target_user:owner,operation,customer});
      if(typeof data!=="string")throw new ApiError(503,"BILLING_COORDINATION_FAILED");
      return data;
    },
    assertMapping:async(owner,customer)=>{
      if(await rpc("axvital_assert_billing_customer",{target_user:owner,customer})!==true)throw new ApiError(503,"BILLING_COORDINATION_FAILED");
    },
  };
}
