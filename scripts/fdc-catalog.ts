import { readFile, open } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { createFoodDataCentralClient } from "../lib/nutrition/fdc/client.ts";
import { prepareFood, importFoodDataCentralFood, type ImportSelection, type PreparedFood } from "../lib/nutrition/fdc/import.ts";

const [command,...args]=process.argv.slice(2);
const flag=(name:string)=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
const input=flag("--input"),output=flag("--output");
async function run(){
 if(!input||!output)throw Error("Usage: fdc-catalog.ts discover|prepare|import --input FILE --output NEW_FILE [--remote --dry-run --refresh]");
 const entries=JSON.parse(await readFile(input,"utf8"));
 if(!Array.isArray(entries)||entries.length>150)throw Error("FDC_INVALID_MANIFEST");
 if(!['discover','prepare','import'].includes(command))throw Error('FDC_UNKNOWN_COMMAND');
 // Reserve the report before any external mutation; never overwrite a prior review.
 const report=await open(output,'wx');
 const results:unknown[]=[];
 try {
 if(command==="discover"||command==="prepare"){
  const api=createFoodDataCentralClient({apiKey:process.env.USDA_FDC_API_KEY??"",hourlyBudget:150});
  for(const selection of entries as ImportSelection[]){
   try {results.push(command==="discover"?{selection,candidates:await api.searchFoodDataCentral(selection.query)}:prepareFood(selection,await api.food(selection.fdcId!)));}
   catch(error){results.push({slug:selection.slug,error:error instanceof Error?error.message:"FDC_FAILED"});}
  }
 }else if(command==="import"){
  if(!args.includes("--remote"))throw Error("FDC_EXPLICIT_REMOTE_REQUIRED");
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw Error("FDC_DATABASE_NOT_CONFIGURED");
  const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  for(const entry of entries as PreparedFood[])results.push({slug:entry.selection.slug,result:await importFoodDataCentralFood(client,entry,{refresh:args.includes("--refresh"),dryRun:args.includes("--dry-run")})});
 }else throw Error("FDC_UNKNOWN_COMMAND");
 }finally{await report.writeFile(JSON.stringify(results,null,2)+"\n");await report.close();}
 if(results.some(r=>typeof r==='object'&&r&&'error'in r))process.exitCode=1;
 console.log(JSON.stringify({command,records:results.length,failures:results.filter(r=>typeof r==="object"&&r&&"error" in r).length,output}));
}
run().catch(error=>{console.error(error instanceof Error&&/^(FDC_|Usage:)/.test(error.message)?error.message:"FDC_COMMAND_FAILED");process.exitCode=1;});
