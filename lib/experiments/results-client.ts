/** UI concurrency only; no scientific calculations or automatic mutation retry. */
export class ResultsRequestState {
  generation=0;
  mutationLocked=false;
  beginRead(){return ++this.generation;}
  current(token:number){return token===this.generation;}
  invalidate(){this.generation++;}
  beginMutation(){if(this.mutationLocked)return false;this.mutationLocked=true;return true;}
  releaseMutation(){this.mutationLocked=false;}
}
export function reconcileCapture(attempt:{before:number;uncertain:boolean},latestRevision:number){
  return latestRevision>attempt.before?"retained":attempt.uncertain?"uncertain":"not_created";
}
