import { CognitiveResult } from "@/components/cognitive/CognitiveTraining";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <CognitiveResult id={id}/>; }
