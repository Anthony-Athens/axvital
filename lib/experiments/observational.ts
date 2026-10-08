import {validateFactors,type Factor} from './factor-config.ts';
export type {Factor} from './factor-config.ts';
import { dateInZone, isLogicalDate, isTimeZone, shiftDate, calendarDays } from '../measurements/time-window.ts';
import { normalizeBodyWeight, type WeightRecord } from '../measurements/body-weight.ts';
export const sources = [
  { key: 'body_weight', label: 'Body weight', unit: 'kg', version: 2 },
  { key: 'energy_score', label: 'Energy', unit: '1–10', version: 1 },
  { key: 'mood_score', label: 'Mood', unit: '1–10', version: 1 },
  { key: 'sleep_quality_score', label: 'Sleep quality', unit: '1–4', version: 1 },
] as const;
export type SourceKey = typeof sources[number]['key'];
export type Metric = { id: string; name: string; description: string; kind: 'numeric'|'rating'|'boolean'; unit: string; min: number|null; max: number|null; anchors: Record<string,string>; direction: 'higher'|'lower'|'neither'; instructions: string; version: 1 };

export type Study = { id: string; title: string; question: string; start_date: string; end_date: string; timezone: string; entry_offset?: 0|-1; finished_on?: string|null; metric_id: string|null; outcome_source: SourceKey|null; factors: Factor[]; status: 'draft'|'active'|'paused'|'completed'|'ended_early'|'abandoned'; revision: number };
export type Observation = { metric_id: string; observed_date: string; status: 'recorded'|'not_observed'; value: number|null; observer: string; coverage: 'brief'|'partial'|'most'|'unknown'; note: string; submitted_at: string; updated_at: string };
export type Checkin = WeightRecord & { checkin_date: string; energy_score?: number|null; mood_score?: number|null; sleep_quality?: string|null };
export function sourceValue(key: SourceKey, row?: Checkin): number|null {
  if (!row) return null;
  if (key === 'body_weight') return normalizeBodyWeight(row).value;
  if (key === 'sleep_quality_score') { const rank = ['Poor','Average','Good','Great'].indexOf(row.sleep_quality ?? ''); return rank < 0 ? null : rank+1; }
  const value = row[key]; return typeof value === 'number' && Number.isFinite(value) && value >= 1 && value <= 10 ? value : null;
}
export function validateMetric(m: Omit<Metric,'id'|'version'>) {
  if (!m || typeof m.name !== 'string' || m.name.trim().length < 2 || m.name.length > 120 || !['numeric','rating','boolean'].includes(m.kind) || !['higher','lower','neither'].includes(m.direction) || typeof m.unit !== 'string' || m.unit.length > 40 || (m.kind === 'numeric' && !m.unit.trim()) || typeof m.description !== 'string' || m.description.length > 500 || typeof m.instructions !== 'string' || m.instructions.length > 1000) throw new Error('INVALID_METRIC');
  if (m.kind === 'rating' && (!Number.isInteger(m.min) || !Number.isInteger(m.max) || m.min! < -100 || m.max! > 100 || m.max! <= m.min! || m.max!-m.min! > 20)) throw new Error('INVALID_SCALE');
  if (m.kind !== 'rating' && (m.min !== null || m.max !== null)) throw new Error('INVALID_SCALE');
  if (!m.anchors || Array.isArray(m.anchors) || typeof m.anchors !== 'object' || Object.entries(m.anchors).some(([k,v])=>m.kind !== 'rating' || !Number.isInteger(Number(k)) || String(Number(k)) !== k || Number(k)<m.min! || Number(k)>m.max! || typeof v !== 'string' || v.length > 120)) throw new Error('INVALID_ANCHORS');
}
export function validateStudy(s: Study) {
  if (typeof s.title !== 'string' || s.title.trim().length < 2 || s.title.length > 120 || typeof s.question !== 'string' || s.question.length > 500 || !isLogicalDate(s.start_date) || !isLogicalDate(s.end_date) || s.end_date < s.start_date || calendarDays(s.start_date, s.end_date)>366 || !isTimeZone(s.timezone) || ![0,-1].includes(s.entry_offset??0) || Boolean(s.metric_id) === Boolean(s.outcome_source) || (s.outcome_source && !sources.some(x=>x.key===s.outcome_source))) throw new Error('INVALID_STUDY');
 validateFactors(s.factors);
}
export function validateObservation(o: Observation, m: Metric, today: string) {
  if (!isLogicalDate(o.observed_date) || o.observed_date>today || !['recorded','not_observed'].includes(o.status) || !['brief','partial','most','unknown'].includes(o.coverage) || typeof o.observer!=='string' || o.observer.length>120 || typeof o.note!=='string' || o.note.length>2000) throw new Error('INVALID_OBSERVATION');
  if (o.status==='not_observed' ? o.value!==null : typeof o.value!=='number' || !Number.isFinite(o.value) || (m.kind==='boolean' && ![0,1].includes(o.value)) || (m.kind==='rating' && (!Number.isInteger(o.value) || o.value<m.min! || o.value>m.max!))) throw new Error('INVALID_VALUE');
}
export function scheduledDates(s: Study, now=new Date()) { const dates:string[]=[]; const end = [s.end_date,shiftDate(dateInZone(now,s.timezone),s.entry_offset??0),...(s.finished_on?[s.finished_on]:[])].sort()[0]; for(let d=s.start_date; d<=end; d=shiftDate(d,1)) dates.push(d); return dates; }
export function completeness(s: Study, values: Map<string, {status:string;value:number|null}>, now=new Date()) {
  const dates=scheduledDates(s,now); let valid=0,notObserved=0; for(const date of dates) {const o=values.get(date);if(o?.status==='not_observed')notObserved++;else if(o?.value!=null)valid++;} return {valid,notObserved,missing:dates.length-valid-notObserved,expected:dates.length};
}
/** Seven calendar days ending on the source date. Mean of available verified kg values;
 * at least one is required; gaps remain gaps at the raw point. No interpolation. */
export function rollingWeight(date:string, rows:Checkin[]) { const start=shiftDate(date,-6); const values=rows.filter(r=>r.checkin_date>=start&&r.checkin_date<=date).map(r=>sourceValue('body_weight',r)).filter((x):x is number=>x!==null); return {value:values.length?values.reduce((a,b)=>a+b,0)/values.length:null,count:values.length}; }


