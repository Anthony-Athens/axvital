// READ ONLY against Stripe/Supabase. Never import this operator tool into the app.
import Stripe from "stripe";
import {createClient} from "@supabase/supabase-js";
import {writeFile} from "node:fs/promises";
import {reconciliationFindings} from "../lib/billing/reconciliation.ts";

async function main(){
  const args=process.argv.slice(2);
  if(args.includes("--help")){
    console.log("Read-only billing inventory. --output <new private JSON path> [--test-clock <clock ID>]. Requires configured STRIPE_SECRET_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. No provider mutations.");
    return;
  }
  const options={};
  for(let i=0;i<args.length;i+=2){
    if(!["--output","--test-clock"].includes(args[i])||!args[i+1]||options[args[i]])throw new Error();
    options[args[i]]=args[i+1];
  }
  if(!options["--output"]||!process.env.STRIPE_SECRET_KEY||!process.env.NEXT_PUBLIC_SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY)throw new Error();
  const provider=new Stripe(process.env.STRIPE_SECRET_KEY,{timeout:10000,maxNetworkRetries:0});
  const admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{
    auth:{persistSession:false,autoRefreshToken:false},
    global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(10000)})},
  });
  async function allRows(table,columns){
    const result=[];
    for(let offset=0;;offset+=500){
      const {data,error}=await admin.from(table).select(columns).order("user_id").range(offset,offset+499);
      if(error)throw new Error();
      result.push(...data);
      if(data.length<500)return result;
    }
  }
  const mappings=await allRows("subscriptions","user_id,stripe_customer_id");
  // This table may not be deployed yet. Missing table is explicitly reported.
  const provisionProbe=await admin.from("billing_customer_provisions").select("user_id").limit(1);
  let provisions=null;
  if(!provisionProbe.error)provisions=await allRows("billing_customer_provisions","user_id,operation_id,created_at,stripe_customer_id");
  else if(!["42P01","PGRST205"].includes(provisionProbe.error.code))throw new Error();
  const scope=options["--test-clock"]?{test_clock:options["--test-clock"]}:{};
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const customers=[];
  for await(const customer of provider.customers.list({limit:100,...scope})){
    const owner=customer.metadata.axvital_user_id;
    customers.push({id:customer.id,owner:uuid.test(owner??"")?owner:null});
  }
  const subscriptions=[];
  for await(const subscription of provider.subscriptions.list({limit:100,status:"all",...scope})){
    subscriptions.push({id:subscription.id,customer:typeof subscription.customer==="string"?subscription.customer:subscription.customer.id,status:subscription.status});
  }
  const mappingErrors=[];
  for(const mapping of mappings){
    if(!mapping.stripe_customer_id)continue;
    try{
      const customer=await provider.customers.retrieve(mapping.stripe_customer_id);
      if(customer.deleted)mappingErrors.push({...mapping,issue:"deleted_customer"});
      else if(customer.metadata.axvital_user_id&&customer.metadata.axvital_user_id!==mapping.user_id)mappingErrors.push({...mapping,issue:"owner_metadata_mismatch"});
    }catch(error){
      if(error.code==="resource_missing")mappingErrors.push({...mapping,issue:"missing_customer"});
      else throw new Error(); // Outage/permission failure is not a missing customer.
    }
  }
  const report={generated_at:new Date().toISOString(),read_only:true,scope:options["--test-clock"]??"default_non_test_clock",consistent_snapshot:false,
    ...reconciliationFindings(mappings,customers,subscriptions),mapping_errors:mappingErrors,
    provisioning_status:provisions===null?"table_not_deployed":"included",provisions,
  };
  // Do not overwrite an existing report. Treat output as private operational data.
  await writeFile(options["--output"],JSON.stringify(report,null,2),{encoding:"utf8",flag:"wx",mode:0o600});
  console.log("Read-only inventory completed. Private report written; no provider state changed.");
}
main().catch(()=>{console.error("Billing inventory failed. No complete report was produced; check configuration, permissions and provider availability. Raw errors are suppressed.");process.exitCode=1;});
