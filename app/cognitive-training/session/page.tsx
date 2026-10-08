import { CognitiveSession } from "@/components/cognitive/CognitiveTraining";
import { validateConfig } from "@/lib/cognitive/model";
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = await searchParams;
  let config = null;
  try { config = validateConfig({ mode: p.mode, value: Number(p.value), operation: p.operation, difficulty: p.difficulty }); } catch {}
  return <CognitiveSession config={config}/>;
}
