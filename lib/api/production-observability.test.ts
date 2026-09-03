import test from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { build } from "esbuild";

async function route(file: string, globals: Record<string, unknown>, mocks: Record<string, string> = {}) {
  const code = (await build({entryPoints:[file],bundle:true,write:false,platform:"node",format:"cjs",plugins:[{
    name:"providers",setup(b){
      b.onResolve({filter:/.*/},args=>mocks[args.path]?{path:args.path,namespace:"fixture"}:undefined);
      b.onLoad({filter:/.*/,namespace:"fixture"},args=>({contents:mocks[args.path]}));
    },
  }]})).outputFiles[0].text;
  const routeModule = {exports:{} as {POST:(request:Request)=>Promise<Response>}};
  runInNewContext(code,{module:routeModule,exports:routeModule.exports,Request,Response,Headers,URL,TextDecoder,AbortSignal,Uint8Array,...globals});
  return routeModule.exports.POST;
}

test("contact failure logs exclude the message, email, API key and provider body",async()=>{
  const logs:unknown[][]=[];
  const POST=await route("app/api/contact/route.ts",{
    process:{env:{RESEND_API_KEY:"secret-key",AXVITAL_CONTACT_EMAIL:"support@example.com",AXVITAL_EMAIL_FROM:"sender@example.com"}},
    console:{error:(...args:unknown[])=>logs.push(args)},
    fetch:async()=>new Response("private provider error",{status:503}),
  });
  const response=await POST(new Request("https://example.com/api/contact",{method:"POST",headers:{Origin:"https://example.com","Content-Type":"application/json"},body:JSON.stringify({name:"Test",email:"private@example.com",topic:"Other",message:"Private contact text",website:""})}));
  assert.equal(response.status,503);
  assert.equal(logs.length,1);
  const log=JSON.stringify(logs);assert.match(log,/provider_rejected/);assert.doesNotMatch(log,/secret-key|private@example|Private contact|private provider/);
  assert.deepEqual(await response.json(),{error:"DELIVERY_FAILED"});
});

test("handled Stripe webhook 500 is observable without logging event or error contents",async()=>{
  const logs:unknown[][]=[];
  const POST=await route("app/api/stripe/webhook/route.ts",{
    process:{env:{STRIPE_WEBHOOK_SECRET:"secret-key"}},console:{error:(...args:unknown[])=>logs.push(args)},
  },{
    "next/headers":'export const headers=async()=>new Headers({"stripe-signature":"fixture"});',
    "@/lib/billing/stripe":'export const stripe=()=>({webhooks:{constructEvent:()=>({id:"private-event",type:"customer.subscription.updated",data:{object:{private:"subscription"}}})}});',
    "@/lib/supabase/admin":'export const createAdminClient=()=>({from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:null})})})})});',
    "@/lib/billing/sync":'export const syncSubscription=async()=>{throw Error("private provider detail")};',
  });
  const response=await POST(new Request("https://example.com/api/stripe/webhook",{method:"POST",body:"{}"}));
  assert.equal(response.status,500);assert.equal(logs.length,1);
  assert.match(JSON.stringify(logs),/stripe\/webhook/);assert.doesNotMatch(JSON.stringify(logs),/private|secret-key/);
  assert.equal(response.headers.get("Cache-Control"),"private, no-store");
});

