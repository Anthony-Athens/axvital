import {act} from "react";
import {createRoot,type Root} from "react-dom/client";
import {NutritionGoals} from "../../../components/nutrition/NutritionGoals";
import {ExperimentWizard} from "../../../components/experiments/ExperimentWizard";
let root:Root|null=null;
export {act};
export function mount(wizard=false){root=createRoot(document.getElementById("goals-root")!);root.render(wizard?<ExperimentWizard/>:<NutritionGoals/>);}
export function unmount(){root?.unmount();root=null;}
export async function settle(){await act(async()=>{await new Promise(resolve=>setTimeout(resolve,30));});}
