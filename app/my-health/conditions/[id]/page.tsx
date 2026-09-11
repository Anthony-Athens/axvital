import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserCondition, conditionDisplayName } from "@/lib/conditions/conditions";
import { loadIntelligence } from "@/lib/condition-intelligence/load";
import { ConditionIntelligence } from "@/components/health/intelligence/ConditionIntelligence";
import { IntelligenceTimezone } from "@/components/health/intelligence/IntelligenceTimezone";
import { isTimeZone } from "@/lib/measurements/time-window";
export default async function IntelligencePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ timeZone?: string }> }) {
  const { id } = await params;
  const client = await createClient();
  const { data } = await client.auth.getUser();
  if (!data.user) redirect("/login");
  const { timeZone } = await searchParams;
  if (!isTimeZone(timeZone)) return <IntelligenceTimezone/>;
  const condition = await getUserCondition(client, id);
  const props = await loadIntelligence(client, data.user.id, id, undefined, timeZone);
  return <ConditionIntelligence condition={{ id, name: conditionDisplayName(condition) }} {...props}/>;
}
