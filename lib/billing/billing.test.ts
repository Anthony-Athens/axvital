import test from"node:test";import assert from"node:assert/strict";import{developmentBypass,entitlementState,hasEntitlement,subscriptionFromRow}from"./entitlements.ts";import{readFileSync}from"node:fs";import{fileURLToPath}from"node:url";
const active={plan:"premium"as const,status:"active"as const,currentPeriodEnd:"2026-09-22T00:00:00Z",cancelAtPeriodEnd:false};
test("free and unknown users fail closed",()=>{assert.equal(hasEntitlement(null,"predictive_outlook",{NODE_ENV:"production",AXVITAL_BILLING_BYPASS:"false"}),false);assert.equal(subscriptionFromRow({plan:"premium",status:"mystery"})?.status,"inactive")});
test("active Premium grants Premium entitlements",()=>assert.equal(hasEntitlement(active,"trigger_discovery",{NODE_ENV:"production"},new Date("2026-08-22")),true));
test("canceled access lasts only through the paid period",()=>{const canceled={...active,status:"canceled"as const,cancelAtPeriodEnd:true};assert.equal(entitlementState(canceled,new Date("2026-08-22")),"grace_period");assert.equal(entitlementState(canceled,new Date("2026-10-01")),"inactive")});
test("past due uses a bounded grace period",()=>assert.equal(entitlementState({...active,status:"past_due"},new Date("2026-08-22")),"grace_period"));
test("development bypass can never run in production",()=>{assert.equal(developmentBypass({NODE_ENV:"development",AXVITAL_BILLING_BYPASS:"true"}),true);assert.equal(developmentBypass({NODE_ENV:"production",AXVITAL_BILLING_BYPASS:"true"}),false)});
test("migration makes billing state read-only and webhook IDs unique",()=>{const sql=readFileSync(fileURLToPath(new URL("../../supabase/migrations/202608220001_add_billing_subscriptions.sql",import.meta.url)),"utf8");assert.match(sql,/stripe_subscription_id text unique/);assert.match(sql,/stripe_event_id text primary key/);assert.match(sql,/for select to authenticated/);assert.doesNotMatch(sql,/for (insert|update|delete) to authenticated/i)});
test("checkout uses an interval allowlist and health-free metadata",()=>{const source=readFileSync(fileURLToPath(new URL("../../app/api/billing/checkout/route.ts",import.meta.url)),"utf8");assert.match(source,/priceFor\(body\.interval\)/);assert.match(source,/axvital_user_id/);assert.doesNotMatch(source,/condition|symptom|episode|nutrition|weight|outlook/i)});
test("Premium APIs enforce server entitlements before analytics",()=>{for(const path of["../../app/api/trigger-patterns/route.ts","../../app/api/condition-outlook/route.ts"]){const source=readFileSync(fileURLToPath(new URL(path,import.meta.url)),"utf8");assert.match(source,/entitlementFor/);assert.match(source,/premiumRequired/)}}); 

import {billingPresentation} from "./presentation.ts";
test("billing dates distinguish renewal, cancellation, grace and expiration",()=>{
 const base={...active,entitlementState:"active",priceId:null};
 assert.equal(billingPresentation(base).dateLabel,"Next billing date");
 assert.equal(billingPresentation({...base,cancelAtPeriodEnd:true}).dateLabel,"Access through");
 assert.equal(billingPresentation({...base,status:"past_due",entitlementState:"grace_period"}).dateLabel,"Access through");
 const expired=billingPresentation({...base,status:"canceled",entitlementState:"inactive"});
 assert.equal(expired.planLabel,"Free");assert.equal(expired.dateLabel,"Last recorded period ended");assert.equal(expired.canManage,true);
});
test("billing UI offers retry and checkout return is not proof of payment",()=>{
 const read=(path:string)=>readFileSync(new URL(path,import.meta.url),"utf8");
 assert.match(read("../../components/billing/BillingPanel.tsx"),/onClick=\{\(\)=>void load\(\)\}[^>]*>Retry/);
 assert.match(read("../../app/settings/billing/page.tsx"),/after your payment is confirmed/);
});


import {authoritativeCustomer,type CustomerDependencies} from "./customer-coordination.ts";
import {syncSubscription} from "./subscription-sync.ts";
import {validateApiRequest} from "../api/validation.ts";
import type {SupabaseClient} from "@supabase/supabase-js";
import type Stripe from "stripe";
test("deleted, missing or mismatched mapped customers never trigger replacement",async()=>{
 for(const failure of ["deleted","missing","owner"]){
  let creates=0;
  const deps:CustomerDependencies={reserve:async()=>({customer_id:"cus_A"}),create:async()=>{creates++;throw new Error()},establish:async()=>{throw new Error()},assertMapping:async()=>{},retrieve:async()=>{if(failure==="missing")throw new Error("unavailable");return{id:"cus_A",deleted:failure==="deleted",owner:failure==="owner"?"B":"A"}}};
  await assert.rejects(authoritativeCustomer("A",deps));assert.equal(creates,0);
 }
});
test("provider timeout retries keep the exact logical creation key and parameters",async()=>{
 const keys:string[]=[];let attempt=0;
 const deps:CustomerDependencies={reserve:async()=>({operation_id:"opaque-operation",retry_before:"2099-01-01"}),create:async(owner,key)=>{keys.push(key);if(attempt++===0)throw new Error("timeout after creation");return{id:"cus_A",owner}},retrieve:async()=>({id:"cus_A",owner:"A"}),establish:async()=>"cus_A",assertMapping:async()=>{}};
 await assert.rejects(authoritativeCustomer("A",deps));assert.equal(await authoritativeCustomer("A",deps),"cus_A");
 assert.deepEqual(keys,["axvital-customer-v1-opaque-operation","axvital-customer-v1-opaque-operation"]);
 deps.now=()=>Date.parse("2100-01-01");await assert.rejects(authoritativeCustomer("A",deps),/RECONCILIATION/);assert.equal(keys.length,2);
});
test("Checkout rejects browser-supplied owner and provider customer IDs",async()=>{
 for(const field of ["user_id","customer","stripe_customer_id"]){
  await assert.rejects(validateApiRequest(new Request("https://example.test/api/billing/checkout",{method:"POST",headers:{Origin:"https://example.test","Content-Type":"application/json"},body:JSON.stringify({interval:"monthly",[field]:"arbitrary"})}),"billing/checkout"));
 }
});
test("webhooks update only matched live mappings and never resurrect closing/deleted owners",async()=>{
 const subscription={id:"sub_A",customer:"cus_A",metadata:{axvital_user_id:"A"},status:"active",items:{data:[]}} as unknown as Stripe.Subscription;
 for(const state of ["live","closing","deleted","unmapped","mismatch","lookup_error","write_race"]){
  let writes=0;
  const admin={auth:{admin:{getUserById:async()=>({data:{user:state==="deleted"?null:{id:"A"}},error:null})}},from:(table:string)=>{
   let updating=false;
   const query={select:()=>query,eq:()=>query,update:()=>{updating=true;return query},maybeSingle:async()=>{
    if(updating){writes++;return state==="write_race"?{data:null,error:{message:"closing guard"}}:{data:{user_id:"A"},error:null}}
    if(table==="account_deletions")return{data:state==="closing"?{user_id:"A"}:null,error:null};
    return{data:state==="unmapped"?null:{user_id:state==="mismatch"?"B":"A"},error:state==="lookup_error"?{message:"unavailable"}:null};
   }};return query;
  }} as unknown as SupabaseClient;
  if(["unmapped","mismatch","lookup_error","write_race"].includes(state))await assert.rejects(syncSubscription(admin,subscription));
  else await syncSubscription(admin,subscription);
  assert.equal(writes,state==="live"||state==="write_race"?1:0,state);
 }
});

import {reconciliationFindings} from "./reconciliation.ts";
test("read-only reconciliation flags duplicate owners and non-authoritative subscriptions",()=>{
 const report=reconciliationFindings([{user_id:"A",stripe_customer_id:"cus_1"}],[{id:"cus_1",owner:"A"},{id:"cus_2",owner:"A"},{id:"cus_unowned",owner:null}],[{id:"sub_1",customer:"cus_1",status:"active"},{id:"sub_2",customer:"cus_2",status:"trialing"}]);
 assert.deepEqual(report.duplicate_metadata_owners,[{user_id:"A",customer_ids:["cus_1","cus_2"]}]);
 assert.deepEqual(report.non_authoritative_subscriptions,[{id:"sub_2",customer:"cus_2",status:"trialing"}]);
 assert.deepEqual(report.customers_without_owner_metadata,["cus_unowned"]);
});
