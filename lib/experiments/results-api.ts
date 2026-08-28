import "server-only";
import type {SupabaseClient} from "@supabase/supabase-js";
import {guardWithClient} from "../api/boundary.ts";
import {ApiError} from "../api/validation.ts";
import {isUuid,isObject,exactKeys} from "../rules/validation.ts";
import {ownedExperiment} from "./draft-read.ts";
import {readDurableAnalysis,captureDurableAnalysis} from "./durable-evidence.ts";
import {discoverResultRevisions} from "./results-service.ts";
export function resultsApi(action:"read"|"capture"|"revisions",createClient:()=>Promise<SupabaseClient>) {
  return guardWithClient(action==="revisions"?"http/experiments/result-revisions":"http/experiments/results",async(request,{client,userId})=>{
    try {
      if(action==="capture") {
        if(request.method!=="POST")throw new ApiError(405,"INVALID_REQUEST");
        const body:unknown=await request.json();
        if(!isObject(body)||!exactKeys(body,["id","expectedAnalysisRevision","expectedLifecycleRevision"])||!isUuid(body.id)||!Number.isSafeInteger(body.expectedAnalysisRevision)||Number(body.expectedAnalysisRevision)<0||Number(body.expectedAnalysisRevision)>31||!Number.isSafeInteger(body.expectedLifecycleRevision)||Number(body.expectedLifecycleRevision)<0||Number(body.expectedLifecycleRevision)>100)throw new ApiError(400,"INVALID_REQUEST");
        const current=await ownedExperiment(client,userId,body.id);
        if(!["completed","ended_early"].includes(String(current.status)))throw new ApiError(409,"TERMINAL_STUDY_REQUIRED");
        return Response.json(await captureDurableAnalysis(client,body.id,Number(body.expectedAnalysisRevision),Number(body.expectedLifecycleRevision)),{status:201});
      }
      if(!["GET","HEAD"].includes(request.method))throw new ApiError(405,"INVALID_REQUEST");
      const params=new URL(request.url).searchParams,id=params.get("id");if(!isUuid(id))throw new ApiError(400,"INVALID_REQUEST");
      if(action==="revisions") {
        const before=params.get("before")??"33";if(!/^[1-9]\d?$/.test(before)||Number(before)>33)throw new ApiError(400,"INVALID_REQUEST");
        return Response.json(await discoverResultRevisions(client,userId,id,Number(before)));
      }
      const revision=params.get("revision");if(!revision||!/^[1-9]\d?$/.test(revision)||Number(revision)>32)throw new ApiError(400,"INVALID_ANALYSIS_REVISION");
      await ownedExperiment(client,userId,id);
      return Response.json(await readDurableAnalysis(client,id,Number(revision)));
    }catch(error){if(error instanceof ApiError)throw error;throw new ApiError(503,"TEMPORARILY_UNAVAILABLE");}
  },createClient,{budgetRoute:action==="capture"?"http/experiments/start":"http/experiments/draft"});
}
