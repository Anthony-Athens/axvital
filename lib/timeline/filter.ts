import type{TimelineEvent,TimelineFilter}from"./types.ts";
const groups:Record<Exclude<TimelineFilter,"all">,TimelineEvent["eventType"][]>={health:["checkin","weight","fluid","medication","episode","note","other"],nutrition:["food","meal","supplement"],symptoms:["symptom"],activity:["workout"],routines:["habit","protocol"],experiments:["experiment"]};
export function filterTimeline(events:TimelineEvent[],filter:TimelineFilter){return filter==="all"?events:events.filter(event=>groups[filter].includes(event.eventType));}
