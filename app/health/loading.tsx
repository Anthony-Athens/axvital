import { LoadingSkeleton, PageContainer } from "@/components/ui/design-system";
export default function HealthLoading() { return <PageContainer><LoadingSkeleton className="h-24"/><div className="mt-6 grid gap-4 sm:grid-cols-2"><LoadingSkeleton className="h-48"/><LoadingSkeleton className="h-48"/></div></PageContainer>; }
