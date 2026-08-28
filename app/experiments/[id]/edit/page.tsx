import { ExperimentWizard } from "@/components/experiments/ExperimentWizard";
export default async function Page({params}:{params:Promise<{id:string}>}) { return <ExperimentWizard draftId={(await params).id}/>; }
