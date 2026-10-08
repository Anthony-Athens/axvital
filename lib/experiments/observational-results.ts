import {mean,median} from '../analytics/statistics.ts';
import type {Evidence,LinkedResponse} from './linked-evidence.ts';
import type {Metric} from './observational.ts';

export const RESULTS_POLICY={version:1,minimumGroup:5,minimumCorrelation:10,minimumDiscordant:5,overlapFraction:.9} as const;
export type OutcomeDefinition=Pick<Metric,'id'|'name'|'kind'|'unit'|'min'|'max'|'anchors'|'direction'>&{version:number};
export type OutcomeRecord={status:string;value:number|null;coverage?:string;note?:string;metric_id?:string};
export type ResultRow={date:string;outcome:OutcomeRecord|undefined;factors:Evidence[]};
export type Summary={n:number;mean:number|null;median:number|null;yes:number;proportion:number|null;distribution:{value:number;count:number}[]};
export type Pair={date:string;source_date:string;outcome:number;factor:number|string;coverage:string;amount:number|null;amount_unit:string|null};
export type Segment={key:string;factor:Evidence['factor'];configuration:string;rule:string|null;unit:string|null;measurement:'status'|'amount';pairs:Pair[];excluded:Record<string,number>;statuses:Record<string,number>;groups:{label:string;summary:Summary;dates:string[]}[];difference:number|null;sentence:string;correlation:{value:number|null;reason:string};timing:string|null};
export type Overlap={first:string;second:string;firstFactor:Evidence['factor'];secondFactor:Evidence['factor'];configuration:string;counts:{both:number;firstOnly:number;secondOnly:number;neither:number};excluded:number;warning:string|null};
export type ObservationalResults={policy:typeof RESULTS_POLICY;definition:OutcomeDefinition;start:string;end:string;counts:{recorded:number;notObserved:number;missing:number;invalid:number};rows:ResultRow[];segments:Segment[];overlaps:Overlap[];notes:{date:string;note:string}[]};

export function validOutcome(outcome:OutcomeRecord|undefined,d:OutcomeDefinition){
 if(!outcome||outcome.status!=='recorded'||typeof outcome.value!=='number'||!Number.isFinite(outcome.value)||outcome.metric_id&&outcome.metric_id!==d.id)return false;
 if(d.version!==(d.id==='body_weight'?2:1))return false;
 if(d.kind==='boolean')return outcome.value===0||outcome.value===1;
 if(d.kind==='rating')return Number.isInteger(outcome.value)&&d.min!==null&&d.max!==null&&outcome.value>=d.min&&outcome.value<=d.max;
 return d.kind==='numeric'&&!!d.unit.trim();
}
export function pairEligibility(e:Evidence,o:OutcomeRecord|undefined,d:OutcomeDefinition,date:string,measurement:'status'|'amount'='status'):{usable:boolean;reason:string}{
 if(!validOutcome(o,d))return {usable:false,reason:o?.status==='not_observed'?'Outcome not observed':!o||o.value===null?'Outcome missing':'Outcome invalid or incompatible'};
 if(e.freshness!=='current')return {usable:false,reason:'Evidence stale or retrieval failed'};
 if(e.outcome_date!==date||!e.source_date||e.contract_version!==1||e.calculation_version!=='linked-v1')return {usable:false,reason:'Evidence alignment or version unsupported'};
 if(['unknown','missing','not_applicable','error','needs_review','incomplete'].includes(e.status))return {usable:false,reason:`Factor ${e.status.replaceAll('_',' ')}`};
 if(measurement==='amount')return {usable:e.complete&&['present','absent'].includes(e.status)&&typeof e.amount==='number'&&Number.isFinite(e.amount)&&e.amount>=0&&['mg','capsule','tablet','iu','ml','g ethanol'].includes(e.amount_unit??''),reason:'Total amount/dose unknown or unsupported'};
 if(e.factor.source==='diet')return {usable:['adherent','nonadherent','planned_exception'].includes(e.status)&&!!e.diet?.rule_version_id,reason:'Diet status or rule context unsupported'};
 if(['food','category','ingredient','alcohol','supplement'].includes(e.factor.source))return {usable:e.status==='present'||e.status==='absent'&&e.complete,reason:'Exposure status unsupported or absence unconfirmed'};
 if(!['body_weight','energy_score','mood_score','sleep_quality_score'].includes(e.factor.source))return {usable:false,reason:'Factor measurement unsupported'};
 const expected=e.factor.source==='body_weight'?'kg':e.factor.source==='sleep_quality_score'?'1–4':'1–10';
 return {usable:e.status==='recorded'&&typeof e.value==='number'&&Number.isFinite(e.value)&&e.unit===expected,reason:'Factor measurement or units unsupported'};
}
export function summarize(values:number[],definition:OutcomeDefinition):Summary{
 const distribution=[...new Set(values)].sort((a,b)=>a-b).map(value=>({value,count:values.filter(v=>v===value).length}));const yes=values.filter(v=>v===1).length;
 return {n:values.length,mean:definition.kind==='numeric'?mean(values):null,median:definition.kind==='boolean'?null:median(values),yes,proportion:definition.kind==='boolean'&&values.length?yes/values.length:null,distribution};
}
function ranks(values:number[]){const sorted=values.map((v,i)=>({v,i})).sort((a,b)=>a.v-b.v),result=Array<number>(values.length);for(let i=0;i<sorted.length;){let j=i+1;while(j<sorted.length&&sorted[j].v===sorted[i].v)j++;for(let k=i;k<j;k++)result[sorted[k].i]=(i+j-1)/2+1;i=j;}return result;}
export function spearman(x:number[],y:number[]){
 if(x.length!==y.length||x.some(v=>!Number.isFinite(v))||y.some(v=>!Number.isFinite(v)))return {value:null,reason:'Invalid paired measurements'};
 if(x.length<RESULTS_POLICY.minimumCorrelation)return {value:null,reason:`Only ${x.length} usable pairs; at least ${RESULTS_POLICY.minimumCorrelation} are required for rank correlation.`};
 if(new Set(x).size<2||new Set(y).size<2)return {value:null,reason:'Insufficient variation: one or both variables are constant.'};
 const a=ranks(x),b=ranks(y),am=mean(a)!,bm=mean(b)!;const numerator=a.reduce((s,v,i)=>s+(v-am)*(b[i]-bm),0),denominator=Math.sqrt(a.reduce((s,v)=>s+(v-am)**2,0)*b.reduce((s,v)=>s+(v-bm)**2,0));return {value:Math.max(-1,Math.min(1,numerator/denominator)),reason:'Descriptive rank correlation; unadjusted for time and other factors.'};
}
const count=(counts:Record<string,number>,key:string)=>{counts[key]=(counts[key]??0)+1;};
function segmentKey(e:Evidence,measurement:'status'|'amount'){return JSON.stringify([e.factor_id,e.factor.offset,e.configuration_version,e.diet?.rule_version_id??null,measurement,measurement==='amount'?e.amount_unit:e.unit,e.calculation_version]);}
function comparison(groups:Segment['groups'],d:OutcomeDefinition){
 const [a,b]=groups;if(!a||!b)return {difference:null,sentence:'No supported comparison groups.'};
 const value=(s:Summary)=>d.kind==='boolean'?s.proportion:d.kind==='rating'?s.median:s.mean;
 const av=value(a.summary),bv=value(b.summary),difference=av===null||bv===null?null:(av-bv)*(d.kind==='boolean'?100:1);
 if(a.summary.n<RESULTS_POLICY.minimumGroup||b.summary.n<RESULTS_POLICY.minimumGroup)return {difference,sentence:`Only ${a.summary.n} ${a.label} and ${b.summary.n} ${b.label} observations; five per group are required for a directional sentence.`};
 const direction=difference===0?'equal':difference!>0?'higher':'lower',measure=d.kind==='boolean'?'proportion of Yes':d.kind==='rating'?'median rating':'average recorded outcome';
 const preferred=d.direction==='neither'?'':` Your preferred direction is ${d.direction}; this does not establish benefit or harm.`;
 return {difference,sentence:`The ${measure} was ${direction} on ${a.label} days (${a.summary.n}) compared with ${b.label} days (${b.summary.n}). This is an unadjusted observational association.${preferred}`};
}
export function calculateResults(linked:LinkedResponse,outcomes:Map<string,OutcomeRecord>,definition:OutcomeDefinition):ObservationalResults{
 const rows=linked.history.map(r=>({...r,outcome:outcomes.get(r.date)}));const counts={recorded:0,notObserved:0,missing:0,invalid:0};
 for(const r of rows){if(validOutcome(r.outcome,definition))counts.recorded++;else if(r.outcome?.status==='not_observed')counts.notObserved++;else if(!r.outcome||r.outcome.value===null)counts.missing++;else counts.invalid++;}
 const segments=new Map<string,Segment>();
 for(const row of rows)for(const e of row.factors)for(const measurement of (['alcohol','supplement'].includes(e.factor.source)?['status','amount']:['status']) as ('status'|'amount')[]){
  const key=segmentKey(e,measurement);if(!segments.has(key))segments.set(key,{key,factor:e.factor,configuration:e.configuration_version,rule:e.diet?.rule_version_id??null,unit:measurement==='amount'?e.amount_unit:e.unit,measurement,pairs:[],excluded:{},statuses:{},groups:[],difference:null,sentence:'',correlation:{value:null,reason:''},timing:null});const s=segments.get(key)!;count(s.statuses,e.status);const eligibility=pairEligibility(e,row.outcome,definition,row.date,measurement);
  if(!eligibility.usable){count(s.excluded,eligibility.reason);continue;}s.pairs.push({date:row.date,source_date:e.source_date,outcome:row.outcome!.value!,factor:measurement==='amount'?e.amount!:e.status==='recorded'?e.value!:e.status,coverage:row.outcome?.coverage??'unknown',amount:e.amount,amount_unit:e.amount_unit});
 }
 for(const s of segments.values()){
  const binary=['food','category','ingredient','alcohol','supplement'].includes(s.factor.source)&&s.measurement==='status',diet=s.factor.source==='diet';
  if(binary||diet){s.groups=(diet?['adherent','nonadherent','planned_exception']:['present','absent']).map(label=>{const p=s.pairs.filter(p=>p.factor===label);return {label,summary:summarize(p.map(p=>p.outcome),definition),dates:p.map(p=>p.date)};});const c=comparison(s.groups,definition);s.difference=c.difference;s.sentence=c.sentence;
   const [a,b]=s.groups;if(a.dates.length&&b.dates.length&&(a.dates.at(-1)!<b.dates[0]||b.dates.at(-1)!<a.dates[0]))s.timing=`Groups occupy separate periods: ${a.label} ${a.dates[0]}–${a.dates.at(-1)}, ${b.label} ${b.dates[0]}–${b.dates.at(-1)}. Time changes cannot be separated from this comparison.`;
  }else{const x=s.pairs.map(p=>Number(p.factor)),y=s.pairs.map(p=>p.outcome);s.correlation=definition.kind==='boolean'?{value:null,reason:'Yes/no outcomes use factor distributions by outcome; rank correlation is not applied.'}:spearman(x,y);s.sentence=s.correlation.reason;
   if(definition.kind==='boolean')s.groups=['Yes','No'].map(label=>{const p=s.pairs.filter(p=>p.outcome===(label==='Yes'?1:0));return {label,summary:summarize(p.map(p=>Number(p.factor)),{...definition,kind:'numeric'}),dates:p.map(p=>p.date)};});
  }
  if(s.excluded['Evidence stale or retrieval failed']||s.excluded['Factor error']){s.sentence='Some factor evidence could not be recalculated. No relationship summary is generated; resolve source errors and refresh.';s.correlation={value:null,reason:s.sentence};}
  else if(s.measurement==='status'&&s.groups.length&&new Set(s.pairs.map(p=>p.factor)).size<2)s.sentence+=' This factor did not vary among usable observations during the selected period.';
 }
 const overlaps=new Map<string,Overlap>();
 for(const row of rows){const binary=row.factors.filter(e=>['food','category','ingredient','alcohol','supplement'].includes(e.factor.source)).sort((a,b)=>a.factor_id.localeCompare(b.factor_id));for(let i=0;i<binary.length;i++)for(let j=i+1;j<binary.length;j++){
  const a=binary[i],b=binary[j],key=JSON.stringify([segmentKey(a,'status'),segmentKey(b,'status')]);if(!overlaps.has(key))overlaps.set(key,{first:a.factor_id,second:b.factor_id,firstFactor:a.factor,secondFactor:b.factor,configuration:a.configuration_version,counts:{both:0,firstOnly:0,secondOnly:0,neither:0},excluded:0,warning:null});const o=overlaps.get(key)!;
  if(!pairEligibility(a,row.outcome,definition,row.date).usable||!pairEligibility(b,row.outcome,definition,row.date).usable){o.excluded++;continue;}const ap=a.status==='present',bp=b.status==='present';o.counts[ap&&bp?'both':ap?'firstOnly':bp?'secondOnly':'neither']++;
 }}
 for(const o of overlaps.values()){const discordant=o.counts.firstOnly+o.counts.secondOnly,anyPresent=discordant+o.counts.both,known=anyPresent+o.counts.neither;if(known&&(discordant<RESULTS_POLICY.minimumDiscordant||anyPresent>0&&o.counts.both/anyPresent>=RESULTS_POLICY.overlapFraction))o.warning=`${discordant<RESULTS_POLICY.minimumDiscordant?`Only ${discordant} discordant observations.`:`Both factors were present on ${o.counts.both}/${anyPresent} dates with either present (at least 90% co-occurrence).`} These factors have limited independent variation; their individual associations cannot be separated reliably.`;}
 return {policy:RESULTS_POLICY,definition,start:rows[0]?.date??'',end:rows.at(-1)?.date??'',counts,rows,segments:[...segments.values()],overlaps:[...overlaps.values()],notes:rows.filter(r=>r.outcome?.note).map(r=>({date:r.date,note:r.outcome!.note!}))};
}
