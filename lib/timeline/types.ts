export type TimelineEventType="checkin"|"weight"|"food"|"meal"|"fluid"|"supplement"|"symptom"|"episode"|"medication"|"workout"|"habit"|"protocol"|"experiment"|"note"|"other";
export type TimelineFilter="all"|"health"|"nutrition"|"symptoms"|"activity"|"routines"|"experiments";
export type TimelineMetadata=Record<string,string|number|boolean|null|string[]>;
export type TimelineEvent={id:string;sourceId:string;sourceType:string;eventType:TimelineEventType;logicalDate?:string;occurredAt:string;endedAt:string|null;title:string;subtitle:string|null;description:string|null;status:string|null;metadata:TimelineMetadata;editable:boolean;deletable:boolean;detailHref:string|null;editHref:string|null};
export type TimelineResult={events:TimelineEvent[];failedSources:string[]};
export type TimelineSourceContext={client:import("@supabase/supabase-js").SupabaseClient;userId:string;start:string;end:string;startDate:string;endDate:string};
export type TimelineSource=(context:TimelineSourceContext)=>Promise<TimelineEvent[]>;
