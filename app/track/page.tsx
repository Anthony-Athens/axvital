import { PageContainer, PageHeader } from "@/components/ui/design-system";
import { TrackOverview } from "@/components/track/TrackOverview";

export default function TrackPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Track"
        description="Everything you log, at a glance. Open an area to log or review."
      />
      <div className="mt-6">
        <TrackOverview />
      </div>
    </PageContainer>
  );
}
