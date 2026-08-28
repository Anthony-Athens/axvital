import type {ResultsDTO,RevisionData} from "../../../components/experiments/ResultsView";
export type CaptureMode="success"|"conflict"|"uncertain_saved"|"uncertain_pending";
/** Deterministic transport fault injection for the real hydrated controller.
 * This is not a substitute for authenticated PostgREST/SQL verification.
 */
export class ResultsTransport {
 calls:{url:string;method:string;body:unknown;signal?:AbortSignal|null}[]=[];
 mode:CaptureMode="success";
 readFailure:number|null=null;
 holdReads=false;
 held:{revision:number;resolve:(response:Response)=>void}[]=[];
 holdMutation=false;
 releaseMutation:(()=>void)|null=null;
 constructor(public metadata:RevisionData,public results:ResultsDTO[],public next:ResultsDTO){}
 retain(){if(!this.results.some(r=>r.analysisRevision===this.next.analysisRevision))this.results.push(this.next);this.metadata={...this.metadata,latestRevision:this.next.analysisRevision,revisions:this.results.slice().reverse().map(r=>({revision:r.analysisRevision,capturedAt:r.capturedAt!,analysisPolicyVersion:r.analysisPolicyVersion,analysisContractVersion:r.analysisContractVersion,eligibility:r.eligibility.state}))};}
 fetch=async(input:RequestInfo|URL,init:RequestInit={}):Promise<Response>=>{
  const url=String(input),method=init.method??"GET";this.calls.push({url,method,body:init.body?JSON.parse(String(init.body)):null,signal:init.signal});
  if(method==="POST"){
   if(this.holdMutation)await new Promise<void>(resolve=>{this.releaseMutation=resolve;});
   if(this.mode==="conflict"){this.retain();return Response.json({error:"CAPTURE_REVISION_CONFLICT"},{status:409});}
   if(this.mode!=="uncertain_pending")this.retain();
   if(this.mode.startsWith("uncertain"))throw new TypeError("Synthetic connection interruption");
   return Response.json(this.next,{status:201,headers:{"cache-control":"private, no-store"}});
  }
  if(url.includes("/revisions?"))return Response.json(this.metadata);
  const revision=Number(new URL(url,"http://localhost").searchParams.get("revision"));
  if(this.holdReads)return new Promise<Response>(resolve=>{this.held.push({revision,resolve});});
  if(this.readFailure===revision)return Response.json({error:"TEMPORARILY_UNAVAILABLE"},{status:503});
  return this.response(revision);
 };
 response(revision:number){const result=this.results.find(r=>r.analysisRevision===revision);return Response.json(result??{error:"ANALYSIS_NOT_FOUND"},{status:result?200:404});}
 releaseReads(){for(const read of this.held.splice(0))read.resolve(this.response(read.revision));}
}
