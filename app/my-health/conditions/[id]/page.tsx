import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserCondition, conditionDisplayName } from "@/lib/conditions/conditions";
import { loadIntelligence } from "@/lib/condition-intelligence/load";
import { ConditionIntelligence } from "@/components/health/intelligence/ConditionIntelligence";
export default async function IntelligencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await createClient();
  const { data } = await client.auth.getUser();
  if (!data.user) redirect("/login");
  const condition = await getUserCondition(client, id);
  const props = await loadIntelligence(client, data.user.id, id);
  return <ConditionIntelligence condition={{ id, name: conditionDisplayName(condition) }} {...props}/>;
}
