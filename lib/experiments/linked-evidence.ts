import {intakeLeaves,ingredientState,type IntakeBundle,type Leaf,type Assessment} from '../diets/model.ts';
import {sourceValue,type Checkin,type Study} from './observational.ts';
import {factorIdentity,type Factor,type FactorVersion,checkinKeys} from './factor-config.ts';
import {shiftDate,localDateBoundary} from '../measurements/time-window.ts';
export type SupplementProduct={id:string;name:string;formulation:string};
export type SupplementEvent={id:string;event_date:string;event_time:string|null;supplement_product_id:string|null;dose_amount:number|null;dose_unit:string|null;title:string;supplement_name?:string|null};
export type SupplementDay={date:string;timezone:string;fingerprint:string;coverage:{fingerprint:string;complete:boolean}|null;events:SupplementEvent[]};
export type Evidence={contract_version:1;calculation_version:'linked-v1';factor_id:string;factor:Factor;configuration_version:string;outcome_date:string;source_date:string;timezone:string;status:string;value:number|string|null;unit:string|null;amount:number|null;amount_unit:string|null;complete:boolean;explanation:string;references:{domain:'nutrition'|'health'|'checkin'|'diet';id:string;detail?:string}[];freshness:'current'|'error';fingerprint:string|null;last_time:string|null;diet?:Assessment};
export function evidenceBase(f:Factor,date:string,version:string,tz:string):Evidence{return {contract_version:1,calculation_version:'linked-v1',factor_id:factorIdentity(f),factor:f,configuration_version:version,outcome_date:date,source_date:shiftDate(date,f.offset),timezone:tz,status:'unknown',value:null,unit:null,amount:null,amount_unit:null,complete:false,explanation:'Logging or relevant identity/ingredients are unresolved.',references:[],freshness:'current',fingerprint:null,last_time:null};}
export function intakeComplete(b:IntakeBundle){return b.coverage?.coverage_status==='complete'&&b.coverage.diet_intake_fingerprint===b.fingerprint&&(b.entries.length+b.events.length>0||b.coverage.diet_no_intake);}
function matches(leaf:Leaf,f:Factor,b:IntakeBundle):'present'|'absent'|'unknown'{
 if(f.source==='ingredient'||f.source==='alcohol')return ingredientState(leaf,f.source==='alcohol'?'alcohol':f.ref as keyof Leaf['evidence'],b);
 if(!leaf.trusted)return 'unknown';
 if(f.source==='food')return leaf.food_id===f.ref?'present':'absent';
 return leaf.categories.includes(f.ref!)?'present':leaf.categories.length?'absent':'unknown';
}
export function foodEvidence(base:Evidence,b:IntakeBundle):Evidence{
 const leaves=intakeLeaves(b),states=leaves.map(l=>matches(l,base.factor,b)),complete=!!intakeComplete(b);
 // A named canonical dish is also a food identity. Its components replace the parent
 // for ingredient/quantity evaluation, but do not erase recorded use of that dish.
 const roots:Evidence['references']=[];
 if(base.factor.source==='food'&&b.catalog.foods.some(f=>f.id===base.factor.ref)){
  for(const a of b.anchors)if(a.food_id===base.factor.ref&&(!['ai','fuzzy','provisional'].includes(a.method)||a.confirmed))roots.push({domain:a.nutrition_entry_id?'nutrition':'health',id:(a.nutrition_entry_id??a.health_event_id)!,detail:'Recorded canonical dish identity'});
  for(const i of b.items)if(!b.anchors.some(a=>a.nutrition_entry_id===i.nutrition_entry_id)&&(i.food_id===base.factor.ref||b.userFoods.some(u=>u.id===i.user_food_id&&u.reviewed_canonical_food_id===base.factor.ref)))roots.push({domain:'nutrition',id:i.nutrition_entry_id,detail:'Recorded canonical food identity'});
 }
 const present=states.includes('present')||roots.length>0;
 const status=present?'present':complete&&!states.includes('unknown')?'absent':'unknown';
 const references:Evidence['references']=[...roots,...leaves.filter((_,i)=>status==='absent'||states[i]!=='absent').map(l=>({domain:l.source.domain,id:l.source.id,detail:[l.label,l.source.component_id?`component ${l.source.component_id}`:'',l.evidence[base.factor.ref as keyof Leaf['evidence']]?.provenance??''].filter(Boolean).join(' · ')}))];
 let amount:number|null=null,last_time:string|null=null;
 // Nutrient snapshots are grams of ethanol, not glasses or assumed standard drinks.
 if(base.factor.source==='alcohol'){
  const known=b.items.filter(i=>(leaves.some(l=>l.source.id===i.nutrition_entry_id&&l.trusted&&(l.source.item_id===i.id||l.food_id===i.food_id))||leaves.filter(l=>l.source.id===i.nutrition_entry_id).length>0&&leaves.filter(l=>l.source.id===i.nutrition_entry_id).every(l=>l.trusted))&&typeof (i as unknown as {alcohol_grams?:number}).alcohol_grams==='number'&&((i as unknown as {alcohol_grams:number}).alcohol_grams)>0);
  if(known.length){references.push(...known.map(i=>({domain:'nutrition' as const,id:i.nutrition_entry_id,detail:'Logged ethanol grams'})));}
  const positive=present||known.length>0;
  const allItemsKnown=b.entries.every(e=>{const items=b.items.filter(i=>i.nutrition_entry_id===e.id);return items.length>0&&items.every(i=>typeof (i as unknown as {alcohol_grams?:number}).alcohol_grams==='number');});
  if(complete&&allItemsKnown&&b.events.length===0&&!states.includes('unknown'))amount=b.items.reduce((sum,i)=>sum+(i as unknown as {alcohol_grams:number}).alcohol_grams,0);
  const sourceIds=new Set([...leaves.filter((_,i)=>states[i]==='present').map(l=>l.source.id),...known.map(i=>i.nutrition_entry_id)]);
  const timestamps=b.entries.filter(e=>sourceIds.has(e.id)).map(e=>e.consumed_at),clocks=b.events.filter(e=>sourceIds.has(e.id)).flatMap(e=>{const t=(e as unknown as {event_time?:string}).event_time;return t?[t]:[]});
  if(!clocks.length)last_time=timestamps.sort((a,c)=>Date.parse(a)-Date.parse(c)).at(-1)??null;
  else if(Date.parse(localDateBoundary(shiftDate(base.source_date,1),base.timezone))-Date.parse(localDateBoundary(base.source_date,base.timezone))<=86400000){const formatter=new Intl.DateTimeFormat('en-GB',{timeZone:base.timezone,hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});const times=[...clocks,...timestamps.map(t=>formatter.format(new Date(t)))];last_time=`${base.source_date}T${times.sort().at(-1)} (${base.timezone})`;}
  return {...base,status:positive?'present':status,value:positive?'present':status==='absent'?'absent':null,complete,amount,amount_unit:amount===null?null:'g ethanol',last_time,fingerprint:b.fingerprint,references:deduplicateRefs(references),explanation:positive?amount===null?'Alcohol is recorded; total ethanol amount is unknown.':'Alcohol is recorded with a complete known ethanol total.':status==='absent'?'Complete resolved beverage/intake evidence establishes no exposure.':'Alcohol identity or complete intake evidence is unresolved.'};
 }
 return {...base,status,value:status==='unknown'?null:status,complete,fingerprint:b.fingerprint,references:deduplicateRefs(references),explanation:status==='present'?'Reliable identity or reviewed ingredient evidence establishes exposure; quantity is not inferred.':status==='absent'?'Complete intake and resolved relevant identities/ingredients establish no exposure.':'Incomplete intake or unresolved relevant identities/ingredients prevent absence.'};
}
export function deduplicateRefs(refs:Evidence['references']){return refs.filter((r,i)=>refs.findIndex(x=>x.domain===r.domain&&x.id===r.id&&x.detail===r.detail)===i);}
export function normalizedDose(value:number|null,unit:string|null):{value:number;unit:string}|null{
 if(value===null||!Number.isFinite(value)||value<=0||!unit)return null;const u=unit.trim().toLowerCase();const masses:Record<string,number>={g:1000,gram:1000,grams:1000,mg:1,milligram:1,milligrams:1,mcg:.001,'µg':.001,microgram:.001,micrograms:.001};
 if(masses[u])return {value:value*masses[u],unit:'mg'};
 if(['capsule','capsules','tablet','tablets','iu','ml'].includes(u))return {value,unit:u==='capsules'?'capsule':u==='tablets'?'tablet':u};return null;
}
export function supplementEvidence(base:Evidence,b:SupplementDay):Evidence{
 const logs=b.events.filter(e=>e.supplement_product_id===base.factor.ref),complete=!!b.coverage?.complete&&b.coverage.fingerprint===b.fingerprint,unresolved=b.events.some(e=>!e.supplement_product_id),status=logs.length?'present':complete&&!unresolved?'absent':'unknown',doses=logs.map(e=>normalizedDose(e.dose_amount,e.dose_unit));
 const compatible=complete&&!unresolved&&logs.length>0&&doses.every(d=>d!==null)&&new Set(doses.map(d=>d?.unit)).size===1;
 return {...base,status,value:status==='unknown'?null:status,complete,amount:compatible?doses.reduce((sum,d)=>sum+d!.value,0):null,amount_unit:compatible?doses[0]!.unit:null,fingerprint:b.fingerprint,last_time:logs.map(e=>e.event_time).filter((t):t is string=>!!t).sort().at(-1)??null,references:logs.map(e=>({domain:'health',id:e.id,detail:`${e.dose_amount??'Unknown dose'} ${e.dose_unit??''} · ${e.event_time??'Unknown time'}`})),explanation:logs.length?compatible?'Reviewed product use and compatible doses recorded.':'Recorded use; total dose is unknown because units/doses or completeness are unresolved.':status==='absent'?'Supplement logging was confirmed complete with no use of this product.':'Supplement logging is not confirmed complete or some product identities are unresolved.'};
}
export function checkinEvidence(base:Evidence,row?:Checkin):Evidence{const value=sourceValue(base.factor.source as typeof checkinKeys[number],row);return {...base,status:value===null?'missing':'recorded',value,unit:base.factor.source==='body_weight'?'kg':base.factor.source==='sleep_quality_score'?'1–4':'1–10',complete:value!==null,references:row?[{domain:'checkin',id:row.checkin_date}]:[],explanation:value===null?'No valid measurement on the resolved date.':'Recorded daily check-in measurement.'};}
export function usablePair(e:Evidence,outcome:{status:string;value:number|null}|undefined,measurement:'status'|'amount'='status'){if(!outcome||outcome.status!=='recorded'||outcome.value===null)return {usable:false,reason:outcome?.status==='not_observed'?'Outcome not observed':'Outcome missing'};if(e.freshness==='error'||['unknown','error','missing','not_applicable','needs_review','incomplete'].includes(e.status))return {usable:false,reason:e.explanation};if(!['recorded','present','absent','adherent','nonadherent','planned_exception'].includes(e.status))return {usable:false,reason:'Unsupported factor status'};if(measurement==='amount'&&e.amount===null)return {usable:false,reason:'Total amount/dose is unknown'};return {usable:true,reason:e.status==='planned_exception'?'Usable as a distinct planned-exception category':'Usable recorded factor category/value'};}
export type LinkedResponse={versions:FactorVersion[];daily:Evidence[];history:{date:string;factors:Evidence[]}[];study:Study};
