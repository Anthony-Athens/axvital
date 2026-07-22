"use client";
import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { activeNavigationId, primaryMobileItems } from "@/lib/navigation/routes";
import { NavigationIcon } from "./NavigationIcon";
import { MobileMoreMenu } from "./MobileMoreMenu";

export function MobileBottomNavigation({ pathname }: { pathname: string }) {
  const [moreOpen, setMoreOpen] = useState(false); const moreButton = useRef<HTMLButtonElement>(null); const activeId = activeNavigationId(pathname);
  const closeMore = useCallback(() => { setMoreOpen(false); requestAnimationFrame(() => moreButton.current?.focus()); }, []);
  return <>
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-1 pt-1 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur-xl lg:hidden" aria-label="Primary mobile navigation">
      <div className="mx-auto grid max-w-lg grid-cols-5">
        {primaryMobileItems.map((item) => { const active = activeId === item.id; return <Link key={item.id} href={item.href} aria-label={`Go to ${item.label}`} aria-current={active ? "page" : undefined} className={`relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-0.5 text-[11px] leading-none outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${active ? "bg-blue-50 font-semibold text-blue-700" : "font-medium text-slate-500 active:bg-slate-100"}`}>{active ? <span className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-blue-600"/> : null}<NavigationIcon name={item.icon} className="h-5 w-5"/><span className="whitespace-nowrap">{item.mobileLabel ?? item.label}</span></Link>; })}
        <button ref={moreButton} type="button" aria-label="Open more navigation" aria-haspopup="dialog" aria-expanded={moreOpen} aria-current={activeId === "more" ? "page" : undefined} aria-controls="mobile-more-menu" onClick={() => setMoreOpen(true)} className={`relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-0.5 text-[11px] leading-none outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${activeId === "more" ? "bg-blue-50 font-semibold text-blue-700" : "font-medium text-slate-500 active:bg-slate-100"}`}>{activeId === "more" ? <span className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-blue-600"/> : null}<NavigationIcon name="more" className="h-5 w-5"/><span>More</span></button>
      </div>
    </nav>
    <MobileMoreMenu open={moreOpen} pathname={pathname} onClose={closeMore}/>
  </>;
}
