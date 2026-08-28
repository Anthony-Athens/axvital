import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";
import {guardWithClient} from "../api/boundary.ts";
import {ApiError} from "../api/validation.ts";
import {exactKeys,isObject,isUuid} from "../rules/validation.ts";
import {goalDefinition,goalSummary,projectGoal,type GoalInput} from "./goals.ts";
const columns="id,name,revision,archived_at,definition";
export function nutritionGoalsApi(createClient:()=>Promise<SupabaseClient>){
 return guardWithClient("http/nutrition/goals",async(request,{client,userId})=>{
  const params=new URL(request.url).searchParams;
  if(request.method==="GET"||request.method==="HEAD"){
   const kind=params.get("kind")??"targets",status=params.get("status")??"active",after=params.get("after");
   if(!["targets","patterns"].includes(kind)||!["active","archived"].includes(status)||(after!==null&&!isUuid(after)))throw new ApiError(400,"INVALID_REQUEST");
   let q=client.from(kind==="targets"?"target_rules":"nutrition_patterns").select(kind==="targets"?columns:"id,name,archived_at").eq("user_id",userId).order("id").limit(41);
   if(kind==="targets")q=q.eq("definition->>domain","nutrition");
   q=status==="active"?q.is("archived_at",null):q.not("archived_at","is",null);
   if(after)q=q.gt("id",after);
   const {data,error}=await q.abortSignal(AbortSignal.timeout(10000));
   if(error||!data)throw new ApiError(503,"TEMPORARILY_UNAVAILABLE");
   const rows=data as unknown as Parameters<typeof projectGoal>[0][];
   return Response.json({items:rows.slice(0,40).map(r=>kind==="targets"?projectGoal(r):{id:r.id,name:r.name,archived:!!r.archived_at}),next:rows.length>40?rows[39].id:null});
  }
  if(request.method!=="POST")throw new ApiError(405,"INVALID_REQUEST");
  const body:unknown=await request.json();
  if(!isObject(body)||typeof body.action!=="string"||!["create","update","archive","restore"].includes(body.action)||!exactKeys(body,body.action==="create"?["action","input"]:body.action==="update"?["action","id","revision","input"]:["action","id","revision"]))throw new ApiError(400,"INVALID_REQUEST");
  let definition:ReturnType<typeof goalDefinition>|undefined,name:string|undefined;
  if(body.action==="create"||body.action==="update"){
   try{definition=goalDefinition(body.input);const input=body.input as GoalInput;name=input.name.trim()||goalSummary(input.metric,input.operator,input.amount);}catch{throw new ApiError(400,"INVALID_GOAL");}
  }
  let query;
  if(body.action==="create")query=client.from("target_rules").insert({user_id:userId,name,definition});
  else{
   if(!isUuid(body.id)||!Number.isSafeInteger(body.revision)||(body.revision as number)<1||(body.revision as number)>2147483647)throw new ApiError(400,"INVALID_REQUEST");
   const {data:owned,error}=await client.from("target_rules").select(columns).eq("id",body.id).eq("user_id",userId).eq("definition->>domain","nutrition").limit(1).abortSignal(AbortSignal.timeout(10000)).maybeSingle();
   if(error)throw new ApiError(503,"TEMPORARILY_UNAVAILABLE");
   if(!owned)throw new ApiError(404,"GOAL_NOT_FOUND");
   if(owned.revision!==body.revision)throw new ApiError(409,"REVISION_CONFLICT");
   if(body.action==="update"&&(!projectGoal(owned).compatible||owned.archived_at))throw new ApiError(400,"INVALID_GOAL");
   query=client.from("target_rules").update(body.action==="update"?{name,definition}:{archived_at:body.action==="archive"?new Date().toISOString():null}).eq("id",body.id).eq("user_id",userId).eq("revision",body.revision).eq("definition->>domain","nutrition");
  }
  const {data,error}=await query.select(columns).abortSignal(AbortSignal.timeout(10000)).maybeSingle();
  if(error)throw new ApiError(503,"TEMPORARILY_UNAVAILABLE");
  if(!data)throw new ApiError(409,"REVISION_CONFLICT");
  return Response.json(projectGoal(data),{status:body.action==="create"?201:200});
 },createClient);
}
