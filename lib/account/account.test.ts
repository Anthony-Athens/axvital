import test from "node:test";
import assert from "node:assert/strict";
import type {SupabaseClient,User} from "@supabase/supabase-js";
import {deleteAccount,exportAccount,type DeletionDependencies} from "./service.ts";
import {publicTrustDetails} from "./trust.ts";
import {validateApiRequest} from "../api/validation.ts";
const user={id:"A",email:"isolated@example.test"} as User;
const client=(signedIn=true)=>({auth:{getUser:async()=>({data:{user:signedIn?user:null},error:null})}} as unknown as SupabaseClient);
const body={confirmation:"DELETE",password:"test-only-password",acceptConsequences:true};
function dependencies(failAt="") {
  const calls:string[]=[];
  const invoke=async(name:string,id:string)=>{assert.equal(id,"A");calls.push(name);if(name===failAt)throw new Error("provider failed")};
  const deps:DeletionDependencies={verifyPassword:async(u,p)=>{assert.equal(u.id,"A");assert.equal(p,body.password);calls.push("reauth");return failAt!=="reauth"},begin:id=>invoke("begin",id),closeBilling:id=>invoke("billing",id),markBillingClosed:id=>invoke("mark",id),deleteAuth:id=>invoke("auth",id)};
  return {calls,deps};
}
test("deletion derives owner from verified auth and completes stages in order",async()=>{const d=dependencies();await deleteAccount(client(),body,d.deps);assert.deepEqual(d.calls,["reauth","begin","billing","mark","auth"])});
test("anonymous deletion and a client-supplied owner are rejected before side effects",async()=>{const d=dependencies();await assert.rejects(deleteAccount(client(false),body,d.deps),/AUTH_REQUIRED/);await assert.rejects(deleteAccount(client(),{...body,user_id:"B"},d.deps),/CONFIRMATION_REQUIRED/);assert.deepEqual(d.calls,[])});
test("deletion needs both exact confirmation and consequence acceptance",async()=>{for(const change of[{confirmation:"delete"},{acceptConsequences:false},{password:""}]){const d=dependencies();await assert.rejects(deleteAccount(client(),{...body,...change},d.deps),/CONFIRMATION_REQUIRED/);assert.deepEqual(d.calls,[])}});
test("failed reauthentication cannot start a deletion",async()=>{const d=dependencies("reauth");await assert.rejects(deleteAccount(client(),body,d.deps),/REAUTH_REQUIRED/);assert.deepEqual(d.calls,["reauth"])});
test("provider failures stop subsequent stages and never claim success",async()=>{for(const [stage,expected] of [["begin",["reauth","begin"]],["billing",["reauth","begin","billing"]],["mark",["reauth","begin","billing","mark"]],["auth",["reauth","begin","billing","mark","auth"]]] as const){const d=dependencies(stage);await assert.rejects(deleteAccount(client(),body,d.deps));assert.deepEqual(d.calls,expected)}});
test("export uses no owner argument, sets a time bound, and fails on missing sources",async()=>{let calls=0;const c={...client(),rpc:(...args:unknown[])=>{assert.deepEqual(args,["axvital_export_account"]);calls++;return {abortSignal:async(signal:AbortSignal)=>{assert.ok(signal instanceof AbortSignal);return {data:{export_version:"axvital.account.v1",data:{daily_checkins:[]}},error:null}}}}} as unknown as SupabaseClient;assert.match(await exportAccount(c),/export_version/);assert.equal(calls,1);await assert.rejects(exportAccount(client(false)),/AUTH_REQUIRED/);const failed={...client(),rpc:()=>({abortSignal:async()=>({data:{partial:true},error:{message:"private error"}})})} as unknown as SupabaseClient;await assert.rejects(exportAccount(failed),/EXPORT_FAILED/)});
test("account mutations require same-origin and reject owner/query overrides",async()=>{const url="https://example.test/api/account/delete";await assert.rejects(validateApiRequest(new Request(url,{method:"POST"}),"account/delete"),/INVALID_ORIGIN/);await assert.rejects(validateApiRequest(new Request(url,{method:"POST",headers:{Origin:"https://example.test","Content-Type":"application/json"},body:JSON.stringify({...body,user_id:"B"})}),"account/delete"));await validateApiRequest(new Request(url,{method:"POST",headers:{Origin:"https://example.test","Content-Type":"application/json"},body:JSON.stringify(body)}),"account/delete")});
test("trust surfaces never invent contact details or legal approval",()=>{assert.deepEqual(publicTrustDetails({}),{supportEmail:null,privacyEmail:null,operator:null,reviewed:false});assert.equal(publicTrustDetails({AXVITAL_SUPPORT_EMAIL:"support@example.test\r\nBcc:x@test.com",AXVITAL_LEGAL_REVIEWED:"true"}).reviewed,false);assert.equal(publicTrustDetails({AXVITAL_SUPPORT_EMAIL:"support@example.test",AXVITAL_OPERATOR_NAME:"Test operator",AXVITAL_LEGAL_REVIEWED:"true"}).reviewed,true)});


test("privacy contact falls back to support only when not separately configured",()=>{
  assert.equal(publicTrustDetails({AXVITAL_SUPPORT_EMAIL:"support@example.test"}).privacyEmail,"support@example.test");
  assert.equal(publicTrustDetails({AXVITAL_SUPPORT_EMAIL:"support@example.test",AXVITAL_PRIVACY_EMAIL:"privacy@example.test"}).privacyEmail,"privacy@example.test");
  assert.equal(publicTrustDetails({AXVITAL_PRIVACY_EMAIL:"invalid"}).privacyEmail,null);
});

import {closeMappedBilling} from "./close-billing.ts";
test("billing closure verifies the mapped customer result and accepts already-deleted retries",async()=>{
  for(const alreadyDeleted of [false,true]){
    const calls:string[]=[];
    await closeMappedBilling({stripe_customer_id:"cus_A",stripe_subscription_id:"sub_A",status:"active"},()=>({retrieve:async id=>{calls.push(id);return{id,deleted:alreadyDeleted}},remove:async id=>{calls.push("delete:"+id);return{id,deleted:true}}}));
    assert.deepEqual(calls,alreadyDeleted?["cus_A"]:["cus_A","delete:cus_A"]);
  }
});
test("billing failures and ambiguous paying mappings fail closed",async()=>{
  const unavailable=()=>{throw new Error("private provider payload")};
  await closeMappedBilling(null,unavailable);
  await closeMappedBilling({stripe_customer_id:null,stripe_subscription_id:null,status:"inactive"},unavailable);
  for(const status of ["active","trialing","past_due","unpaid","paused"]){
    await assert.rejects(closeMappedBilling({stripe_customer_id:null,stripe_subscription_id:null,status},unavailable),/BILLING_REVIEW_REQUIRED/);
  }
  const mapping={stripe_customer_id:"cus_A",stripe_subscription_id:"sub_A",status:"active"};
  await assert.rejects(closeMappedBilling(mapping,unavailable),/BILLING_CLOSE_FAILED/);
  for(const result of [{id:"cus_A",deleted:false},{id:"cus_B",deleted:true}]){
    await assert.rejects(closeMappedBilling(mapping,()=>({retrieve:async id=>({id}),remove:async()=>result})),/BILLING_CLOSE_FAILED/);
  }
});

import {readFileSync} from "node:fs";
test("account integration keeps service privileges server-only and rights unpaywalled",()=>{
 const read=(path:string)=>readFileSync(new URL(path,import.meta.url),"utf8");
 assert.match(read("./deletion-server.ts"),/import "server-only"/);
 assert.match(read("../supabase/admin.ts"),/import "server-only"/);
 for(const path of ["../../app/api/account/export/route.ts","../../app/api/account/delete/route.ts","../../app/settings/data/page.tsx","../../app/settings/delete/page.tsx"]){
  assert.doesNotMatch(read(path),/hasEntitlement|premiumRequired|entitlementFor/);
 }
 for(const path of ["../../components/account/DeleteAccountForm.tsx","../../components/account/ExportDataButton.tsx"]){
  assert.doesNotMatch(read(path),/SERVICE_ROLE|createAdminClient|trackEvent/);
 }
 const privacy=read("../../app/privacy/page.tsx"),terms=read("../../app/terms/page.tsx");
 for(const provider of ["Supabase","Stripe","Resend","Vercel"])assert.ok(privacy.includes(provider));
 assert.match(terms,/OWNER DECISION REQUIRED/);assert.match(terms,/governing law and venue/);
 assert.match(read("../../app/contact/page.tsx"),/mailto:/);
});
