import { withApiGuard } from "@/lib/api/guard";
import{NextRequest}from"next/server";import{createClient}from"@/lib/supabase/server";import{getTimeline}from"@/lib/timeline/getTimeline";
const date=/^\d{4}-\d{2}-\d{2}$/;
async function handleGET(request:NextRequest){const q=request.nextUrl.searchParams,start=q.get("start"),end=q.get("end"),startDate=q.get("startDate"),endDate=q.get("endDate");if(!start||!end||!startDate||!endDate||!date.test(startDate)||!date.test(endDate)||!Number.isFinite(Date.parse(start))||!Number.isFinite(Date.parse(end))||Date.parse(end)<=Date.parse(start)||Date.parse(end)-Date.parse(start)>32*86400000)return Response.json({error:"INVALID_RANGE"},{status:400});try{const result=await getTimeline(await createClient(),{start,end,startDate,endDate});return Response.json(result,{headers:{"Cache-Control":"private, no-store"}})}catch(error){return Response.json({error:error instanceof Error&&error.message==="AUTH_REQUIRED"?"AUTH_REQUIRED":"TIMELINE_FAILED"},{status:error instanceof Error&&error.message==="AUTH_REQUIRED"?401:500})}}

export const GET = withApiGuard("timeline", handleGET);
