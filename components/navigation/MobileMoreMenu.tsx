"use client";
import Link from "next/link";
import { type RefObject, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { moreNavigationItems, matchesRoute, type NavigationGroup } from "@/lib/navigation/routes";
import { NavigationIcon } from "./NavigationIcon";

const groups: Array<{ id: NavigationGroup; label: string }> = [{ id: "planning", label: "Planning and Programs" }, { id: "workouts", label: "Workout Tools" }, { id: "insights", label: "Insights and Recaps" }, { id: "account", label: "Account" }];
export function MobileMoreMenu({ open, pathname, onClose }: { open: boolean; pathname: string; onClose: () => void; returnFocusRef?: RefObject<HTMLButtonElement | null> }) {
  const dialogRef = useRef<HTMLDivElement>(null); const router = useRouter(); const [signingOut, setSigningOut] = useState(false);
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow; document.body.style.overflow = "hidden";
    const dialog = dialogRef.current; const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ?? []);
    focusable()[0]?.focus();
    function keydown(event: KeyboardEvent) { if (event.key === "Escape") { event.preventDefault(); onClose(); return; } if (event.key !== "Tab") return; const items = focusable(); if (!items.length) return; const first = items[0]; const last = items.at(-1)!; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } }
    document.addEventListener("keydown", keydown); return () => { document.removeEventListener("keydown", keydown); document.body.style.overflow = previousOverflow; };
  }, [open, onClose]);
  if (!open) return null;
  async function signOut() { if (signingOut) return; setSigningOut(true); const { createClient } = await import("@/lib/supabase/browser"); await createClient().auth.signOut(); onClose(); router.push("/login"); router.refresh(); }
  return <div className="fixed inset-0 z-[60] bg-slate-950/50 lg:hidden" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="mobile-more-title" id="mobile-more-menu" className="safe-bottom absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-y-auto rounded-t-[2rem] bg-white px-5 pb-4 pt-5 shadow-2xl">
      <div className="flex items-center justify-between"><h2 id="mobile-more-title" className="text-2xl font-black">More</h2><button type="button" onClick={onClose} aria-label="Close more navigation" className="grid min-h-11 min-w-11 place-items-center rounded-full bg-slate-100 text-xl font-black">×</button></div>
      {groups.map((group) => { const items = moreNavigationItems.filter((item) => item.group === group.id); return items.length ? <section key={group.id} className="mt-5"><h3 className="px-2 text-xs font-black uppercase tracking-widest text-slate-500">{group.label}</h3><div className="mt-2 grid gap-1">{items.map((item) => { const active = matchesRoute(pathname, item.matchPrefixes); return <Link key={item.id} href={item.href} onClick={onClose} aria-current={active ? "page" : undefined} className={`flex min-h-12 items-center gap-3 rounded-2xl px-4 font-bold ${active ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200" : "text-slate-700 active:bg-slate-100"}`}><NavigationIcon name={item.icon} className="h-5 w-5"/><span>{item.label}</span>{active ? <span className="ml-auto text-xs font-black uppercase">Current</span> : null}</Link>; })}</div></section> : null; })}
      <button type="button" disabled={signingOut} onClick={() => void signOut()} className="mt-5 flex min-h-12 w-full items-center rounded-2xl px-4 text-left font-black text-rose-700 active:bg-rose-50 disabled:opacity-60">{signingOut ? "Signing Out…" : "Sign Out"}</button>
    </div>
  </div>;
}
