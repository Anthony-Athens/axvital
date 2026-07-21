import { Suspense } from "react";
import { WeeklyPlanner } from "@/components/planner/WeeklyPlanner";

export default function WeeklyOverviewPage() { return <Suspense fallback={<div className="mx-auto max-w-6xl p-6 font-black">Loading your weekly plan…</div>}><WeeklyPlanner /></Suspense>; }
