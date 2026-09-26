// Operator/server-only module. Node built-ins intentionally prevent browser bundling.
import { createHash } from "node:crypto";
import { dataTypes, mapFoodDataCentral, type DataType } from "./mapping.ts";

export type FdcCandidate = { fdc_id:number; description:string; data_type:DataType; brand:string|null; macros:Record<string,number|null>; portions: string[] };
export function createFoodDataCentralClient(options:{apiKey:string;fetch?:typeof fetch;now?:()=>number;hourlyBudget?:number}) {
  if (!options.apiKey.trim()) throw Error("FDC_NOT_CONFIGURED");
  if(options.hourlyBudget!==undefined&&(!Number.isInteger(options.hourlyBudget)||options.hourlyBudget<1||options.hourlyBudget>1000))throw Error('FDC_INVALID_BUDGET');
  const fetcher=options.fetch??fetch, now=options.now??Date.now;
  const cache=new Map<string,{expires:number;value:unknown}>(),pending=new Map<string,Promise<unknown>>();
  let windowStart=now(),used=0,blockedUntil=0;
  async function request(path:string,body?:unknown,refresh=false):Promise<unknown> {
    const cacheKey=createHash("sha256").update(path+JSON.stringify(body??null)).digest("hex");
    const hit=cache.get(cacheKey); if(!refresh && hit && hit.expires>now()) return structuredClone(hit.value);
    if(pending.has(cacheKey)) return structuredClone(await pending.get(cacheKey));
    if(now()-windowStart>=3600000){windowStart=now();used=0;}
    if(now()<blockedUntil || used>=(options.hourlyBudget??100)) throw Error("FDC_RATE_LIMITED");
    used++;
    const run=(async()=>{
      try {
        const url=new URL(`https://api.nal.usda.gov/fdc/v1/${path}`);url.searchParams.set("api_key",options.apiKey);
        const response=await fetcher(url,{method:body?"POST":"GET",headers:body?{"Content-Type":"application/json"}:undefined,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(12000),redirect:"error"});
        if(response.status===429){blockedUntil=now()+Math.min(3600,Math.max(60,Number(response.headers.get("retry-after"))||60))*1000;throw Error("FDC_RATE_LIMITED");}
        if(response.status===404) throw Error("FDC_NOT_FOUND");
        if(!response.ok) throw Error("FDC_UNAVAILABLE");
        if(Number(response.headers.get("content-length"))>8000000 || !response.body) throw Error("FDC_INVALID_RESPONSE");
        const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
        try {for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>8000000){await reader.cancel();throw Error("FDC_INVALID_RESPONSE");}chunks.push(value);}}finally{reader.releaseLock();}
        const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
        const value:unknown=JSON.parse(new TextDecoder().decode(bytes));
        if(cache.size>=100)cache.delete(cache.keys().next().value!);cache.set(cacheKey,{expires:now()+900000,value});return value;
      } catch(error) {
        if(error instanceof Error && /^FDC_(RATE_LIMITED|NOT_FOUND|UNAVAILABLE|INVALID_RESPONSE)$/.test(error.message))throw error;
        // Never propagate a request URL, API key, provider body, or fetch error detail.
        throw Error("FDC_UNAVAILABLE");
      }
    })(); pending.set(cacheKey,run);
    try{return structuredClone(await run);}finally{pending.delete(cacheKey);}
  }
  return {
    /** Only explicit operator-supplied catalog terms, never a transcript or user log. */
    async searchFoodDataCentral(query:string,includeBranded=false):Promise<FdcCandidate[]> {
      if(!query.trim() || query.length>120 || /[\r\n]/.test(query))throw Error("FDC_INVALID_QUERY");
      const response=await request("foods/search",{query:query.trim(),dataType:includeBranded?[...dataTypes]:dataTypes.slice(0,3),pageSize:30,pageNumber:1});
      if(!response || typeof response!=="object" || !Array.isArray((response as {foods:unknown}).foods))throw Error("FDC_INVALID_RESPONSE");
      const foods=(response as {foods:Record<string,unknown>[]}).foods;
      if(foods.length>30)throw Error("FDC_INVALID_RESPONSE");
      return foods.filter(f=>f && typeof f === "object" && Number.isSafeInteger(f.fdcId) && Number(f.fdcId)>0 && typeof f.description==='string' && f.description.length<=300 && dataTypes.includes(f.dataType as DataType) && (includeBranded||f.dataType!=="Branded")).map(f=>{
        const ns=Array.isArray(f.foodNutrients)?f.foodNutrients as {nutrientId:number;value:number;unitName:string}[]:[];
        const get=(id:number,unit:string)=>{const n=ns.find(n=>n && n.nutrientId===id&&String(n.unitName).toLowerCase()===unit);return n&&Number.isFinite(n.value)&&n.value>=0?n.value:null;};
        return {fdc_id:Number(f.fdcId),description:f.description as string,data_type:f.dataType as DataType,brand:typeof f.brandOwner==='string'?f.brandOwner.slice(0,160):null,macros:{calories:get(2048,"kcal")??get(2047,"kcal")??get(1008,"kcal"),protein_grams:get(1003,"g"),carbohydrate_grams:get(1005,"g"),fat_grams:get(1004,"g")},portions:[]};
      }).sort((a,b)=>dataTypes.indexOf(a.data_type)-dataTypes.indexOf(b.data_type)).slice(0,12);
    },
    async food(fdcId:number,refresh=false) {
      if(!Number.isSafeInteger(fdcId)||fdcId<=0)throw Error("FDC_INVALID_ID");
      const mapped=mapFoodDataCentral(await request(`food/${fdcId}`,undefined,refresh));
      if(mapped.external_id!==fdcId)throw Error("FDC_ID_MISMATCH");return mapped;
    },
  };
}
