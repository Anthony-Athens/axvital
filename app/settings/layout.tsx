import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
export default async function AccountLayout({children}:{children:React.ReactNode}) {
  const {data,error}=await (await createClient()).auth.getUser();
  if(error || !data.user) redirect("/login");
  return <><nav aria-label="Account utilities" className="mx-auto flex max-w-6xl flex-wrap gap-1 border-b border-slate-200 px-4 py-3">{[["/settings","Account"],["/profile","Profile & Preferences"],["/settings/security","Security"],["/settings/billing","Billing"],["/settings/data","Export My Data"],["/settings/delete","Delete Account"],["/contact","Support"]].map(([href,label])=><Link key={href} href={href} className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-blue-700 hover:bg-blue-50 focus-visible:ring-2 focus-visible:ring-blue-600">{label}</Link>)}</nav>{children}</>;
}
