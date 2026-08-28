import {act,createElement} from "react";
import {renderToString} from "react-dom/server";
import {hydrateRoot,type Root} from "react-dom/client";
import {ExperimentResults} from "../../../components/experiments/ExperimentResults";
import type {ResultsDTO,RevisionData} from "../../../components/experiments/ResultsView";
import {ResultsTransport} from "./results-transport";
let root:Root|null=null;
export const hydrationErrors:string[]=[];
export {act};
export function mount(metadata:RevisionData,results:ResultsDTO[],next:ResultsDTO){
 const transport=new ResultsTransport(metadata,results,next);
 window.fetch=transport.fetch;
 const element=createElement(ExperimentResults,{id:metadata.experiment.id});
 const container=document.getElementById("results-root")!;
 container.innerHTML=renderToString(element);
 root=hydrateRoot(container,element,{onRecoverableError:error=>{hydrationErrors.push(String(error));}});
 return transport;
}
export function unmount(){root?.unmount();root=null;}
export async function settle(){await act(async()=>{await new Promise(resolve=>setTimeout(resolve,20));});}
