"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { isFocusedWorkoutRoute } from "@/lib/navigation/routes";
import { DesktopNavigation } from "./navigation/DesktopNavigation";
import { MobileBottomNavigation } from "./navigation/MobileBottomNavigation";
import { CampaignHeader } from "./campaigns/CampaignHeader";
import { isConditionCampaignPath } from "@/lib/campaigns/conditions";

function Logo({ href }: { href: string }) { return <Link href={href} className="flex items-center gap-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2" aria-label={href === "/" ? "AXVital home" : "AXVital Today"}><span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-600 text-sm font-black text-white">AX</span><span className="text-lg font-semibold tracking-tight text-slate-900">AXVital</span></Link>; }
export function Navbar() {
  const pathname = usePathname();
  return isConditionCampaignPath(pathname) ? <CampaignHeader/> : <ProductNavbar/>;
}
function ProductNavbar() {
  const pathname = usePathname(); const router = useRouter(); const [supabase] = useState(createClient); const [authenticated, setAuthenticated] = useState<boolean | null>(null); const focusedWorkout = isFocusedWorkoutRoute(pathname);
  useEffect(() => { let active = true, known: boolean | null = null; supabase.auth.getSession().then(({ data }) => { if (active && known === null) { known = Boolean(data.session); setAuthenticated(known); } }); const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => { const next = Boolean(session?.user); /* Re-render server data only when auth actually flips, not on token refresh or tab focus. */ if (known !== null && known !== next) router.refresh(); known = next; setAuthenticated(next); }); return () => { active = false; subscription.unsubscribe(); }; }, [router, supabase]);
  async function handleLogout() { await supabase.auth.signOut(); setAuthenticated(false); router.push("/login"); router.refresh(); }
  return <><header className={`fixed inset-x-0 top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur-xl ${focusedWorkout ? "hidden lg:block" : ""}`}><div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 lg:h-20 lg:px-6"><Logo href={authenticated ? "/today" : "/"}/>{authenticated ? <DesktopNavigation pathname={pathname}/> : null}<div className="flex min-h-11 items-center gap-2">{authenticated === null ? null : authenticated ? <button type="button" onClick={handleLogout} className="hidden h-11 rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 lg:block">Logout</button> : <><Link href="/login" className="flex h-11 items-center rounded-xl px-4 text-sm font-semibold text-slate-700">Login</Link><Link href="/signup" className="flex h-11 items-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">Get Started</Link></>}</div></div></header>{authenticated && !focusedWorkout ? <MobileBottomNavigation pathname={pathname}/> : null}</>;
}
