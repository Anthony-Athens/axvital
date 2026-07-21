"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

const navItems = [
  { href: "/today", label: "Today", short: "Today" },
  { href: "/weekly-overview", label: "Weekly Overview", short: "Planner" },
  { href: "/habits", label: "Habits", short: "Habits" },
  { href: "/protocols", label: "Protocols", short: "Protocols" },
  { href: "/workouts", label: "Workouts", short: "Workouts" },
  { href: "/dashboard", label: "Dashboard", short: "Home" },
  { href: "/insights", label: "Insights", short: "Insights" },
  { href: "/weekly-recap", label: "Weekly Recap", short: "Recap" },
  { href: "/profile", label: "Profile", short: "Profile" },
];

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2" aria-label="AXVital home">
      <span className="grid h-9 w-9 place-items-center rounded-2xl bg-emerald-500 text-sm font-black text-white shadow-sm">
        AX
      </span>
      <span className="text-lg font-black tracking-tight text-slate-950">
        AXVital
      </span>
    </Link>
  );
}

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    let active = true;

    supabase.auth.getUser().then(({ data }) => {
      if (active) {
        setAuthenticated(Boolean(data.user));
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthenticated(Boolean(session?.user));
      router.refresh();
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [router, supabase.auth]);

  async function handleLogout() {
    await supabase.auth.signOut();
    setAuthenticated(false);
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-40 border-b border-white/70 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 md:h-20 md:px-6">
          <Logo />
          <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
            {authenticated
              ? navItems.map((item) => {
                  const active = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                        active
                          ? "bg-slate-950 text-white"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })
              : null}
          </nav>
          <div className="hidden items-center gap-2 md:flex">
            {authenticated ? (
              <button
                type="button"
                onClick={handleLogout}
                className="h-11 rounded-full bg-slate-950 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800"
              >
                Logout
              </button>
            ) : (
              <>
                <Link
                  href="/login"
                  className="flex h-11 items-center rounded-full border border-slate-200 bg-white px-5 text-sm font-bold text-slate-900 transition hover:bg-slate-50"
                >
                  Login
                </Link>
                <Link
                  href="/signup"
                  className="flex h-11 items-center rounded-full bg-emerald-500 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-600"
                >
                  Sign Up
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <nav
        className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-2 pt-2 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] backdrop-blur-xl md:hidden"
        aria-label="Mobile primary"
      >
        <div
          className={`mx-auto grid max-w-md gap-1 ${
            authenticated ? "grid-cols-10" : "grid-cols-2"
          }`}
        >
          {authenticated ? (
            <>
              {navItems.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex min-h-14 flex-col items-center justify-center rounded-2xl px-2 text-[11px] font-bold transition ${
                      active
                        ? "bg-emerald-50 text-emerald-700"
                        : "text-slate-500 active:bg-slate-100"
                    }`}
                  >
                    <span
                      className={`mb-1 h-1.5 w-7 rounded-full ${
                        active ? "bg-emerald-500" : "bg-transparent"
                      }`}
                    />
                    {item.short}
                  </Link>
                );
              })}
              <button
                type="button"
                onClick={handleLogout}
                className="flex min-h-14 flex-col items-center justify-center rounded-2xl px-2 text-[11px] font-bold text-slate-500 active:bg-slate-100"
              >
                <span className="mb-1 h-1.5 w-7 rounded-full bg-transparent" />
                Logout
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className={`flex min-h-14 flex-col items-center justify-center rounded-2xl px-2 text-[11px] font-bold transition ${
                  pathname === "/login"
                    ? "bg-slate-950 text-white"
                    : "text-slate-500 active:bg-slate-100"
                }`}
              >
                <span
                  className={`mb-1 h-1.5 w-7 rounded-full ${
                    pathname === "/login" ? "bg-white" : "bg-transparent"
                  }`}
                />
                Login
              </Link>
              <Link
                href="/signup"
                className={`flex min-h-14 flex-col items-center justify-center rounded-2xl px-2 text-[11px] font-bold transition ${
                  pathname === "/signup"
                    ? "bg-emerald-50 text-emerald-700"
                    : "text-slate-500 active:bg-slate-100"
                }`}
              >
                <span
                  className={`mb-1 h-1.5 w-7 rounded-full ${
                    pathname === "/signup" ? "bg-emerald-500" : "bg-transparent"
                  }`}
                />
                Sign Up
              </Link>
            </>
          )}
        </div>
      </nav>
    </>
  );
}
