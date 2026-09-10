import { aggregateActivity, calendarDay, CONDITION_RANGE_LABEL, DAY, days, lookback, PRE_EPISODE_LOOKBACK_DAYS, timelineLayout, timelineX, type Activity, type Episode } from "@/lib/condition-intelligence/model";

export const dateLabel = (at: number) => new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const colors = ["#2563eb", "#059669", "#9333ea", "#d97706", "#0891b2", "#db2777", "#475569"];
export function HealthEventLegend({ categories }: { categories: string[] }) {
  return <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-600">{categories.map((category, i) => <li key={category} className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: colors[i % colors.length] }}/>{category}</li>)}<li>● Episode</li><li>Shaded: {PRE_EPISODE_LOOKBACK_DAYS}-day lookback</li></ul>;
}
export function PreEpisodeWindow({ left, width, bottom }: { left: number; width: number; bottom: number }) { return <rect x={left} y={60} width={width} height={bottom - 60} fill="#dbeafe" opacity={0.7}/>; }
export function EpisodeInterval({ x, y, label }: { x: number; y: number; label: string }) { return <text x={x} y={y} textAnchor="middle" fontSize={11} fill="#475569">{label}</text>; }
export function EpisodeMarker({ episode, x, index, mode, bottom }: { episode: Episode; x: number; index: number; mode: "app" | "marketing"; bottom: number }) {
  const marker = <><title>{`Episode ${index + 1}: ${dateLabel(episode.start)}; ${episode.end === null ? "Ongoing" : days((episode.end - episode.start) / DAY)}; severity ${episode.severity ?? "not recorded"}`}</title><line x1={x} x2={x} y1={60} y2={bottom} stroke="#0f172a" strokeWidth={3}/><circle cx={x} cy={bottom} r={9} fill="#0f172a"/><text x={x} y={35 + index % 2 * 15} textAnchor="middle" fontSize={11} fill="#0f172a">#{index + 1} · {dateLabel(episode.start)}</text></>;
  return mode === "app" ? <a href={`/health/episodes/${episode.id}`} aria-label={`Open episode ${index + 1}, ${dateLabel(episode.start)}`}>{marker}</a> : <g>{marker}</g>;
}
export function ConditionTimeline({ episodes, healthEvents, start, now, mode }: { episodes: Episode[]; healthEvents: Activity[]; start: number; now: number; mode: "app" | "marketing" }) {
  const categories = [...new Set(healthEvents.map(e => e.category))].sort();
  const width = Math.max(1200, episodes.length * 150), x = (at: number) => timelineX(Math.max(start, Math.min(now, at)), start, now, width);
  const layout = timelineLayout(categories.length);
  return <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 sm:p-5"><h2 className="text-lg font-semibold">Episode history</h2><p id="timeline-help" className="mt-1 text-sm text-slate-500">{CONDITION_RANGE_LABEL} · Scroll horizontally to explore. Daily markers and shaded calendar days use UTC.</p><div className="mt-4 max-w-full overflow-x-auto rounded-lg bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-600" role="region" aria-label="Condition timeline" aria-describedby="timeline-help" tabIndex={0}><svg width={width} height={layout.height} role="group" aria-label="Episodes and daily aggregated health activity" style={{ maxWidth: "none" }}>
    {episodes.map(e => <PreEpisodeWindow key={e.id} left={x(lookback(calendarDay(e.start)).start)} width={x(calendarDay(e.start)) - x(lookback(calendarDay(e.start)).start)} bottom={layout.plotBottom}/>)}
    <line x1={100} x2={width - 120} y1={layout.plotBottom} y2={layout.plotBottom} stroke="#cbd5e1"/>
    {aggregateActivity(healthEvents.filter(e => e.at >= start && e.at <= now)).map(tick => <rect data-activity-day={tick.at} key={`${tick.at}:${tick.category}`} x={x(tick.at + DAY / 2)} y={layout.activityY(categories.indexOf(tick.category))} width={2} height={8} fill={colors[categories.indexOf(tick.category) % colors.length]}><title>{dateLabel(tick.at)} · {tick.category}: {tick.count} records</title></rect>)}
    {episodes.map((episode, i) => <EpisodeMarker key={episode.id} episode={episode} index={i} x={x(calendarDay(episode.start))} mode={mode} bottom={layout.plotBottom}/>)}
    {episodes.slice(1).map((e, i) => <EpisodeInterval key={e.id} x={(x(calendarDay(e.start)) + x(calendarDay(episodes[i].start))) / 2} y={layout.intervalY + i % 3 * 14} label={days((e.start - episodes[i].start) / DAY)}/>)}
    <text x={100} y={layout.axisY} fontSize={12}>{dateLabel(start)}</text><text x={width - 120} y={layout.axisY} textAnchor="end" fontSize={12}>{dateLabel(now)}</text>
  </svg></div>{episodes.length ? <p className="mt-3 text-sm text-slate-600">{days((now - episodes.at(-1)!.start) / 86400000)} since last episode started</p> : null}<HealthEventLegend categories={categories}/></section>;
}
