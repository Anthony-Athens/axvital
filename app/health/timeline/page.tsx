import{Suspense}from"react";import{HealthTimelinePage}from"@/components/timeline/HealthTimelinePage";
export default function Page(){return <Suspense fallback={<p className="p-6" role="status">Loading Health Timeline…</p>}><HealthTimelinePage/></Suspense>}
