import { ConditionManager } from "@/components/health/ConditionManager";
export default async function ConditionPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <ConditionManager id={id}/>; }
