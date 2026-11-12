import type { Metadata } from "next";
import type{ReactNode}from"react";import{ConditionPatternHighlights}from"@/components/episodes/ConditionPatternHighlights";export const metadata: Metadata = { title: "Insights | AXVital", robots: { index: false, follow: false } };
export default function Layout({children}:{children:ReactNode}){return <>{children}<div className="mx-auto max-w-5xl px-4 pb-8 sm:px-6"><ConditionPatternHighlights/></div></>}
