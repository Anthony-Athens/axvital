import {ApiError} from "../api/validation.ts";

export type CustomerReservation = {customer_id:string} | {operation_id:string;retry_before:string};
export type BillingCustomer = {id:string;deleted?:boolean;owner?:string};
export type CustomerDependencies = {
  reserve:(owner:string)=>Promise<CustomerReservation>;
  create:(owner:string,key:string)=>Promise<BillingCustomer>;
  retrieve:(customer:string)=>Promise<BillingCustomer>;
  establish:(owner:string,operation:string,customer:string)=>Promise<string>;
  assertMapping:(owner:string,customer:string)=>Promise<void>;
  now?:()=>number;
};

/** owner comes only from requireUser in the guarded route; never from its body. */
export async function authoritativeCustomer(owner:string,deps:CustomerDependencies) {
  const reservation=await deps.reserve(owner);
  let id:string;
  if("customer_id" in reservation) {
    id=reservation.customer_id;
  } else {
    const deadline=Date.parse(reservation.retry_before);
    if(!Number.isFinite(deadline)||(deps.now??Date.now)()>=deadline)throw new ApiError(409,"BILLING_RECONCILIATION_REQUIRED");
    // Opaque durable UUID: no email or health information in the key. Exact
    // creation parameters remain stable across all retries of this operation.
    const created=await deps.create(owner,`axvital-customer-v1-${reservation.operation_id}`);
    if(created.deleted||!created.id||created.owner!==owner)throw new ApiError(409,"BILLING_CUSTOMER_INVALID");
    id=await deps.establish(owner,reservation.operation_id,created.id);
    if(id!==created.id)throw new ApiError(409,"BILLING_MAPPING_CONFLICT");
  }
  const customer=await deps.retrieve(id);
  if(customer.deleted||customer.id!==id||(customer.owner&&customer.owner!==owner))throw new ApiError(409,"BILLING_CUSTOMER_INVALID");
  await deps.assertMapping(owner,id);
  return id;
}
