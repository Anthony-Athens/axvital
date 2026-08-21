import { WorkoutTemplateBuilder } from "@/components/workouts/WorkoutTemplateBuilder";
export default async function Page({params}:{params:Promise<{id:string}>}){const{id}=await params;return <WorkoutTemplateBuilder templateId={id}/>;}
