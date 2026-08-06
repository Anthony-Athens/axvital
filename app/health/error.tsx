"use client";
import { Button, InlineNotice, PageContainer } from "@/components/ui/design-system";
export default function HealthError({ reset }: { reset: () => void }) { return <PageContainer narrow><InlineNotice>We couldn’t open My Health.</InlineNotice><Button className="mt-4" onClick={reset}>Try again</Button></PageContainer>; }
