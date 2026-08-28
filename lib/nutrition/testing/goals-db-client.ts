// Disposable tests/browser harness ONLY. Never imported by application routes.
import type {PGlite} from "@electric-sql/pglite";
import type {SupabaseClient} from "@supabase/supabase-js";
export function goalsDbClient(db:PGlite,userId:string|null){
 const safe=(name:string)=>{if(!/^[a-z_]+$/.test(name))throw new Error("Unsafe test identifier");return name;};
 return {auth:{getUser:async()=>({data:{user:userId?{id:userId}:null},error:null})},
  rpc(name:string,args:Record<string,unknown>){
   if(!["axvital_consume_api_budget","discover_experiment_targets_v1"].includes(name))throw new Error("Unsupported test RPC");
   const run=async()=>{try{const result=await db.query(`select * from public.${name}(${Object.keys(args).map((k,i)=>safe(k)+" => $"+(i+1)).join(",")})`,Object.values(args));return {data:name==="axvital_consume_api_budget"?(result.rows[0] as Record<string,unknown>)?.axvital_consume_api_budget:result.rows,error:null};}catch(e){return {data:null,error:{message:String(e)}};}};
   return {abortSignal(){return this;},then(resolve:(v:unknown)=>unknown,reject:(e:unknown)=>unknown){return run().then(resolve,reject);}};
  },
  from(table:string){
   if(!["target_rules","nutrition_patterns"].includes(table))throw new Error("Unsupported test table");
   let mode="select",values:Record<string,unknown>={},columns="*",single=false,limit=100,order="id";
   const filters:{key:string;op:string;value:unknown}[]=[];
   const column=(k:string)=>k==="definition->>domain"?"definition->>'domain'":safe(k);
   const q={select(c:string){columns=c;return q;},eq(key:string,value:unknown){filters.push({key,op:"=",value});return q;},gt(key:string,value:unknown){filters.push({key,op:">",value});return q;},is(key:string,value:unknown){filters.push({key,op:"is",value});return q;},not(key:string,_op:string,value:unknown){filters.push({key,op:"is not",value});return q;},order(k:string){order=safe(k);return q;},limit(n:number){limit=n;return q;},abortSignal(){return q;},maybeSingle(){single=true;return q;},insert(v:Record<string,unknown>){mode="insert";values=v;return q;},update(v:Record<string,unknown>){mode="update";values=v;return q;},
    then(resolve:(v:unknown)=>unknown,reject:(e:unknown)=>unknown){return run().then(resolve,reject);}};
   async function run(){
    const args:unknown[]=[];const param=(v:unknown)=>{args.push(v);return "$"+args.length;};
    const cols=columns.split(",").map(safe).join(",");
    const assignments=Object.entries(values).map(([k,v])=>[safe(k),param(v)] as const);
    const where=filters.map(f=>f.op.startsWith("is")?`${column(f.key)} ${f.op} null`:`${column(f.key)} ${f.op} ${param(f.value)}`).join(" and ")||"true";
    const sql=mode==="insert"?`insert into ${table}(${assignments.map(a=>a[0]).join(",")}) values(${assignments.map(a=>a[1]).join(",")}) returning ${cols}`:mode==="update"?`update ${table} set ${assignments.map(a=>a.join("=")).join(",")} where ${where} returning ${cols}`:`select ${cols} from ${table} where ${where} order by ${order} limit ${limit}`;
    try{const result=await db.query(sql,args);return {data:single?result.rows[0]??null:result.rows,error:null};}catch(e){return {data:null,error:{message:String(e)}};}
   }return q;
  }
 } as unknown as SupabaseClient;
}
