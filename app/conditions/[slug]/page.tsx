import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ConditionLandingPage } from "@/components/campaigns/ConditionLandingPage";
import { conditionCampaigns, getConditionCampaign } from "@/lib/campaigns/conditions";

type Props = { params: Promise<{ slug: string }> };
export const dynamicParams = false;
export function generateStaticParams() {
  return Object.keys(conditionCampaigns).map(slug => ({ slug }));
}
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const content = getConditionCampaign(slug);
  if (!content) notFound();
  return {
    title: content.title,
    description: content.description,
    openGraph: { title: content.title, description: content.description, type: "website", siteName: "AXVital" },
    alternates: { canonical: `https://www.axvital.com/conditions/${slug}` },
    robots: { index: true, follow: true },
    referrer: "no-referrer",
  };
}
export default async function Page({ params }: Props) {
  const content = getConditionCampaign((await params).slug);
  if (!content) notFound();
  return <ConditionLandingPage content={content}/>;
}
