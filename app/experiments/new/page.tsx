import { ExperimentWizard } from '@/components/experiments/ExperimentWizard';
import Link from 'next/link';
export default function Page(){return <><nav aria-label="Study type" className="mx-auto flex max-w-5xl flex-wrap gap-3 px-4 pt-6"><span className="font-semibold">Intervention: plan a change</span><Link className="rounded-lg border px-3 py-2 underline focus-visible:ring-2" href="/experiments/observational">Observational: track changing factors</Link></nav><ExperimentWizard/></>;}
