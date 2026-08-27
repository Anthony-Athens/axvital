import test from "node:test";
import assert from "node:assert/strict";
import { boundedText, validateApiRequest, validateDateRange } from "./validation.ts";
import { isClientProductEvent } from "../product-events.ts";
import { isRoute, protectedRoutes } from "../supabase/routes.ts";
import { guardWithClient } from "./boundary.ts";
import type { SupabaseClient } from "@supabase/supabase-js";

test("API boundary rejects anonymous calls, fails closed without rate storage, and never caches previews",async()=>{
  let called=0;
  const handler=async()=>{called++;return Response.json({premiumRequired:true,episodeCount:2});};
  const request=new Request("https://example.com/api/billing/status");
  for(const [user,error,allowed,status] of [[null,null,true,401],[{id:"A"},null,false,429],[{id:"A"},{code:"unavailable"},true,503],[{id:"A"},null,true,200]] as const){
    const client={auth:{getUser:async()=>({data:{user},error:null})},rpc:async()=>({data:allowed,error})} as unknown as SupabaseClient;
    const response=await guardWithClient("billing/status",handler,async()=>client)(request);
    assert.equal(response.status,status);assert.equal(response.headers.get("Cache-Control"),"private, no-store");
    if(status===429)assert.equal(response.headers.get("Retry-After"),"60");
  }
  assert.equal(called,1);
});

test("client intent cannot forge server-confirmed events",()=>{for(const event of["premium_activated","checkout_completed","checkout_started","signup_completed","first_daily_checkin",null,{}])assert.equal(isClientProductEvent(event),false);assert.equal(isClientProductEvent("pricing_viewed"),true);assert.equal(isClientProductEvent("upgrade_clicked"),true)});
test("private route matching covers nested Health and Experiments but leaves public routes public",()=>{for(const path of["/today","/health","/health/timeline","/health/nutrition","/experiments","/experiments/example/results","/settings/billing"])assert.equal(isRoute(path,protectedRoutes),true);for(const path of["/","/login","/signup","/forgot-password","/reset-password","/pricing","/privacy","/terms","/contact","/healthcare"])assert.equal(isRoute(path,protectedRoutes),false)});
test("body bounds count bytes even without Content-Length",async()=>{await assert.rejects(boundedText(new Request("https://example.com",{method:"POST",body:"😀".repeat(3000)})),/BODY_TOO_LARGE/);assert.equal(await boundedText(new Request("https://example.com",{method:"POST",body:'{"event":"pricing_viewed"}'})),'{"event":"pricing_viewed"}')});
test("invalid JSON, unexpected fields and cross-origin mutations are rejected",async()=>{for(const body of["null","[]","{",'{"interval":"monthly","user_id":"B"}'])await assert.rejects(validateApiRequest(new Request("https://example.com/api/billing/checkout",{method:"POST",headers:{"content-type":"application/json"},body}),"billing/checkout"));await assert.rejects(validateApiRequest(new Request("https://example.com/api/billing/portal",{method:"POST",headers:{origin:"https://attacker.test"}}),"billing/portal"),/INVALID_ORIGIN/)});
test("health ranges reject impossible, reversed, oversized and disjoint logical dates",()=>{assert.doesNotThrow(()=>validateDateRange("2026-08-20T04:00:00Z","2026-08-22T04:00:00Z","2026-08-20","2026-08-21",32));for(const args of[["2026-02-30T00:00:00Z","2026-03-01T00:00:00Z","2026-02-30","2026-03-01"],["2026-08-22T00:00:00Z","2026-08-20T00:00:00Z","2026-08-20","2026-08-21"],["2026-01-01T00:00:00Z","2026-08-22T00:00:00Z","2026-01-01","2026-08-21"],["2026-08-20T00:00:00Z","2026-08-22T00:00:00Z","2026-08-01","2026-08-02"]])assert.throws(()=>validateDateRange(...args as [string,string,string,string],32))});
test("analytics requests bound the existing 97-day source window",async()=>{const query=new URLSearchParams({start:"2026-05-17T04:00:00Z",end:"2026-08-22T04:00:00Z",endDate:"2026-08-21",window:"30",timeZone:"America/New_York"});await validateApiRequest(new Request(`https://example.com/api/analytics?${query}`),"analytics");query.set("timeZone","invalid");await assert.rejects(validateApiRequest(new Request(`https://example.com/api/analytics?${query}`),"analytics"))});
test("duplicate query parameters and malformed UUIDs fail safely",async()=>{await assert.rejects(validateApiRequest(new Request("https://example.com/api/condition-outlook?condition=------------------------------------"),"condition-outlook"));await assert.rejects(validateApiRequest(new Request("https://example.com/api/timeline?start=a&start=b"),"timeline"))});

test("account boundaries deny anonymous and budgeted calls and keep JSON private",async()=>{
 for(const route of ["account/export","account/delete"]){
  let called=0;
  for(const [user,allowed,status] of [[null,true,401],[{id:"A"},false,429],[{id:"A"},true,200]] as const){
   const client={auth:{getUser:async()=>({data:{user},error:null})},rpc:async()=>({data:allowed,error:null})} as unknown as SupabaseClient;
   const response=await guardWithClient(route,async()=>{called++;return Response.json({export_version:"axvital.account.v1",data:{}})},async()=>client)(new Request(`https://example.com/api/${route}`,{method:"POST",headers:{Origin:"https://example.com","Content-Type":"application/json"},body:"{}"}));
   assert.equal(response.status,status);assert.equal(response.headers.get("Cache-Control"),"private, no-store");
   assert.ok(await response.json());
  }
  assert.equal(called,1);
 }
});
