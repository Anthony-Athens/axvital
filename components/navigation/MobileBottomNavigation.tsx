"use client";
import Link from "next/link";
import { activeNavigationId, primaryMobileItems } from "@/lib/navigation/routes";
import { NavigationIcon } from "./NavigationIcon";

export function MobileBottomNavigation({ pathname }: { pathname: string }) {
  const activeId = activeNavigationId(pathname);
  return (
    <nav
      className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-ground/95 px-1 pt-1 backdrop-blur-xl lg:hidden"
      aria-label="Primary mobile navigation"
    >
      <div className="mx-auto grid max-w-lg grid-cols-5">
        {primaryMobileItems.map((item) => {
          const active = activeId === item.id;
          return (
            <Link
              key={item.id}
              href={item.href}
              aria-label={`Go to ${item.label}`}
              aria-current={active ? "page" : undefined}
              className={`relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-0.5 text-xs leading-none outline-none focus-visible:ring-2 focus-visible:ring-accent-fg ${active ? "font-semibold text-accent-fg" : "font-medium text-fg-3 active:bg-raised"}`}
            >
              {active ? (
                <span className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-accent-fg" />
              ) : null}
              <NavigationIcon name={item.icon} className="h-5 w-5" />
              <span className="whitespace-nowrap">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
