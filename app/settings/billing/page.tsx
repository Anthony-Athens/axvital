import { BillingPanel } from "@/components/billing/BillingPanel";
import { PageContainer } from "@/components/ui/design-system";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const { checkout } = await searchParams;
  return (
    <PageContainer narrow>
      {checkout === "success" ? (
        <p role="status" className="mb-4 rounded-xl bg-blue-500/10 p-4 text-blue-100">
          <strong>Checkout returned.</strong> Your plan will update after your payment is confirmed.
        </p>
      ) : null}
      <BillingPanel />
    </PageContainer>
  );
}
