import Link from "next/link";
import { activeNavigationId, desktopNavigationItems } from "@/lib/navigation/routes";
export function DesktopNavigation({ pathname }: { pathname: string }) {
  const activeId = activeNavigationId(pathname);
  return (
    <nav className="hidden items-center gap-0.5 lg:flex" aria-label="Primary">
      {desktopNavigationItems.map((item) => {
        const active = activeId === item.id;
        return (
          <Link
            key={item.id}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-xl px-3 py-2.5 text-sm font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-accent-fg xl:px-3.5 xl:text-[15px] ${active ? "bg-raised font-semibold text-fg" : "text-fg-2 hover:bg-raised/60 hover:text-fg"}`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
