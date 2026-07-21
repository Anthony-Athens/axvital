import type { NavigationIcon as IconName } from "@/lib/navigation/routes";

const paths: Record<IconName, React.ReactNode> = {
  today: <><path d="M7 3v3m10-3v3M4 9h16"/><rect x="4" y="5" width="16" height="16" rx="3"/><path d="M8 13h3v3H8z"/></>,
  planner: <><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4m8-4v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></>,
  workouts: <><path d="M6 8v8m12-8v8M3 10v4m18-4v4M6 12h12"/></>,
  progress: <><path d="M4 19V9m6 10V5m6 14v-7m4 7H2"/></>,
  more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
  habits: <path d="M12 21C6 18 4 14 4 10a4 4 0 0 1 7-2.6A4 4 0 0 1 20 10c0 4-2 8-8 11Z"/>,
  protocols: <><path d="M8 3h8v4H8zM6 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1M8 12h8m-8 4h5"/></>,
  exercises: <><path d="M6 8v8m12-8v8M3 10v4m18-4v4M6 12h12"/></>,
  insights: <><path d="M9 18h6m-5 3h4"/><path d="M8 14a7 7 0 1 1 8 0c-1 .8-1 2-1 2H9s0-1.2-1-2Z"/></>,
  recap: <><path d="M4 4v6h6M5 9a8 8 0 1 1 1 8"/><path d="M12 8v5l3 2"/></>,
  profile: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
};
export function NavigationIcon({ name, className = "h-6 w-6" }: { name: IconName; className?: string }) { return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>{paths[name]}</svg>; }
