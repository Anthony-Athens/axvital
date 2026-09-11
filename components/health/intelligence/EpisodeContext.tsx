"use client";
import { useEffect, useRef } from "react";
import { Surface, Button } from "@/components/ui/design-system";
import { days, type Episode } from "@/lib/condition-intelligence/model";
import { episodeContext } from "@/lib/condition-intelligence/context";
import { formatCalendarDay } from "@/lib/measurements/time-window";

export function EpisodeContext({ episode, context, partial, onClose }: { episode: Episode; context: ReturnType<typeof episodeContext>; partial: boolean; onClose: () => void }) {
  const region = useRef<HTMLDivElement>(null);
  useEffect(() => { region.current?.focus({ preventScroll: true }); region.current?.scrollIntoView({ block: "nearest" }); }, [episode.id]);
  return <div id="selected-episode-context" ref={region} tabIndex={-1} className="mt-4 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-blue-600" role="region" aria-label="Selected episode details"><Surface><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold text-blue-700">Selected episode · {episode.end === null ? "Ongoing" : "Completed"}</p><h2 className="mt-1 text-lg font-semibold">{formatCalendarDay(context.startDay)}</h2></div><Button variant="secondary" onClick={onClose}>Clear episode focus</Button></div>
    <dl className="mt-4 grid grid-cols-1 gap-3 min-[390px]:grid-cols-2"><div><dt>End date</dt><dd>{context.endDay === null ? "Ongoing" : formatCalendarDay(context.endDay)}</dd></div><div><dt>Completed duration</dt><dd>{days(context.duration, episode.end === null ? "Ongoing" : "Not recorded")}</dd></div><div><dt>Severity</dt><dd>{episode.severity === null ? "Not recorded" : `${episode.severity} / 10`}</dd></div><div><dt>Since prior episode started</dt><dd>{days(context.priorInterval, "No prior episode in this history")}</dd></div></dl>
    <h3 className="mt-5 font-semibold">7-day context</h3><p className="mt-2 text-sm">{context.usableDays === null ? "Tracking coverage unavailable" : context.usableDays === 0 ? "No usable tracking data was recorded in the 7 days before this episode." : `Usable check-in coverage: ${context.usableDays} / 7 days`}</p><p className="mt-1 text-xs text-slate-500">A usable day has at least one valid answer for the four existing factors. Coverage describes tracking, not daily activity requirements.</p>
    <ul className="mt-3 grid gap-2 min-[390px]:grid-cols-2 text-sm">{context.coverage.map(c => <li key={c.key}>{c.label}: {c.days === null ? "Unavailable" : `${c.days} / 7 days`}</li>)}</ul><p className="mt-4 text-sm">{partial ? "Available " : ""}health-event records: {context.eventCount}{partial ? " (some sources unavailable)" : ""}</p><ul className="mt-2 flex flex-wrap gap-3 text-sm text-slate-600">{context.categories.map(([category,count]) => <li key={category}>{category}: {count}</li>)}</ul>
  </Surface></div>;
}
