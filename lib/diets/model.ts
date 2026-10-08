import { isLogicalDate, shiftDate, dateInZone, isTimeZone } from '../measurements/time-window.ts';
import { isUuid } from '../rules/validation.ts';
export const ingredientKeys=['dairy','gluten','meat','fish','egg','animal_derived','plant_derived','grain','legume','added_sugar','alcohol'] as const;
export type Rule={kind:'food'|'category'|'ingredient';ref:string;action:'allow'|'exclude'};
export type Plan={name:string;instructions:string;mode:'illustrative'|'exhaustive';rules:Rule[];weekly_exceptions:number[];dated_exceptions:string[]};
export type Diet={id:string;draft:Plan;archived:boolean;revision:number};
export type Enrollment={id:string;diet_id:string;start_date:string;end_date:string|null;timezone:string;revision:number;stopped:boolean;cancelled?:boolean};
export type Version={id:string;enrollment_id:string;effective_from:string;revision:number;plan:Plan};
export type Catalog={foods:{id:string;name:string;common_aliases?:string[];category_id?:string|null;source_type?:string;is_verified?:boolean;recipe_unit?:string|null}[];categories:{id:string;name:string;slug:string}[];maps:{food_id:string;category_id:string}[];library:{parent_food_id:string;component_food_id:string;source:string}[]};
export type Evidence={id:string;food_id?:string|null;user_food_id?:string|null;nutrition_entry_item_id?:string|null;component_id?:string|null;event_food_id?:string|null;health_event_id?:string|null;classification_key:string;state:'present'|'absent'|'unknown';provenance:string;reviewed_at?:string|null;updated_at?:string};
export type Item={id:string;nutrition_entry_id:string;food_id:string|null;user_food_id:string|null;source_name:string};
export type Anchor={id:string;nutrition_entry_id:string|null;health_event_id:string|null;food_id:string|null;label:string;method:string;confirmed:boolean};
export type Component={id:string;event_food_id:string;food_id:string|null;label:string;source:string;included:boolean;confirmed:boolean};
export type Bundle={enrollment:Enrollment;version:Version;date:string;fingerprint:string;coverage:{coverage_status:string;diet_intake_fingerprint:string|null;diet_no_intake:boolean;confirmed_at:string|null}|null;entries:{id:string;title:string|null;consumed_at:string}[];events:{id:string;title:string|null;event_date:string;event_type:string}[];items:Item[];anchors:Anchor[];components:Component[];userFoods:{id:string;name:string;reviewed_canonical_food_id:string|null;review_provenance:string|null}[];catalog:Catalog;shared:Evidence[];private:Evidence[]};
export type Leaf={source:{domain:'nutrition'|'health';id:string;item_id?:string;component_id?:string;event_food_id?:string;user_food_id?:string};label:string;food_id:string|null;trusted:boolean;categories:string[];evidence:Partial<Record<typeof ingredientKeys[number],{state:Evidence['state'];provenance:string;id:string}>>};
export type Reason={kind:'violation'|'review'|'allowed';message:string;rule:Rule|null;source:Leaf['source'];evidence_id?:string;provenance?:string};
export type Assessment={contract_version:1;calculation_version:'diet-v1';freshness:'current';enrollment_id:string;rule_version_id:string;local_date:string;timezone:string;calculated_status:'adherent'|'nonadherent'|'needs_review'|'incomplete'|'planned_exception';logging_complete:boolean;no_intake_confirmed:boolean;confirmation_invalidated:boolean;exception:boolean;fingerprint:string;reasons:Reason[];items:Leaf[]};
export const blankPlan=():Plan=>({name:'',instructions:'',mode:'illustrative',rules:[],weekly_exceptions:[],dated_exceptions:[]});
export function validatePlan(p:Plan,activate=false,catalog?:Catalog){
 if(!p||typeof p.name!=='string'||p.name.length>120||typeof p.instructions!=='string'||p.instructions.length>2000||!['illustrative','exhaustive'].includes(p.mode)||!Array.isArray(p.rules)||p.rules.length>100||!Array.isArray(p.weekly_exceptions)||p.weekly_exceptions.length>7||p.weekly_exceptions.some(x=>!Number.isInteger(x)||x<0||x>6)||new Set(p.weekly_exceptions).size!==p.weekly_exceptions.length||!Array.isArray(p.dated_exceptions)||p.dated_exceptions.length>100||p.dated_exceptions.some(x=>!isLogicalDate(x))||new Set(p.dated_exceptions).size!==p.dated_exceptions.length)throw Error('Enter valid rules and exception dates.');
 if(activate&&(!p.name.trim()||!p.rules.length))throw Error('Add a name and at least one rule before following this diet.');
 const seen=new Map<string,string>();
 for(const r of p.rules){if(!r||!['food','category','ingredient'].includes(r.kind)||!['allow','exclude'].includes(r.action)||typeof r.ref!=='string'||(r.ref!==''&&(r.kind==='ingredient'?!ingredientKeys.includes(r.ref as typeof ingredientKeys[number]):!isUuid(r.ref)))||(r.kind==='ingredient'&&r.action!=='exclude')||(activate&&!r.ref))throw Error('Choose a valid subject for every rule.');const key=`${r.kind}:${r.ref}`;if(activate&&seen.has(key))throw Error('Resolve duplicate or contradictory rules before activation.');seen.set(key,r.action);
 if(activate&&catalog&&r.kind!=='ingredient'&&!catalog[r.kind==='food'?'foods':'categories'].some(x=>x.id===r.ref))throw Error('A selected food or category is unavailable.');}
 if(activate&&p.mode==='exhaustive'&&!p.rules.some(r=>r.action==='allow'))throw Error('An exhaustive diet needs at least one allowed food or category.');
 if(activate&&catalog)for(const f of catalog.foods){if(p.rules.some(r=>r.kind==='food'&&r.ref===f.id))continue;const matched=p.rules.filter(r=>r.kind==='category'&&catalog.maps.some(m=>m.food_id===f.id&&m.category_id===r.ref));if(new Set(matched.map(r=>r.action)).size>1)throw Error(`Category rules conflict for ${f.name}. Add a specific food exception or resolve the rules.`);}
}
export function enrollmentDates(e:Enrollment,start:string,end:string,now=new Date()){
 if(e.cancelled)return [];if(!isLogicalDate(start)||!isLogicalDate(end)||!isTimeZone(e.timezone))throw Error('INVALID_DATE');const today=dateInZone(now,e.timezone),last=[end,today,...(e.end_date?[e.end_date]:[])].sort()[0],first=[start,e.start_date].sort().at(-1)!;const dates:string[]=[];for(let d=first;d<=last;d=shiftDate(d,1)){if(dates.length>=366)throw Error('WINDOW_TOO_LARGE');dates.push(d);}return dates;
}
export function applicableVersion(versions:Version[],date:string){return versions.filter(v=>v.effective_from<=date).sort((a,b)=>b.effective_from.localeCompare(a.effective_from)||b.revision-a.revision)[0]??null;}
export function intakeLeaves(b:Bundle):Leaf[]{
 const leaves:Leaf[]=[];
 function emit(label:string,foodId:string|null,trusted:boolean,source:Leaf['source'],trail:string[]=[]){
  const mappedUser=b.userFoods.find(f=>f.id===source.user_food_id);foodId=foodId??mappedUser?.reviewed_canonical_food_id??null;
  const children=foodId?b.catalog.library.filter(c=>c.parent_food_id===foodId):[];
  if(children.length){if(trail.includes(foodId!)||trail.length>=6){leaves.push({label,food_id:foodId,source,trusted:false,categories:[],evidence:{}});return;}for(const c of children){const f=b.catalog.foods.find(f=>f.id===c.component_food_id);emit(f?.name??'Unknown component',c.component_food_id,trusted&&c.source!=='ai_inferred',source,[...trail,foodId!]);}return;}
  const food=b.catalog.foods.find(f=>f.id===foodId);const evidence:Leaf['evidence']={};
  for(const key of ingredientKeys){const matches=b.private.filter(e=>e.classification_key===key&&((source.component_id&&e.component_id===source.component_id)||(source.item_id&&e.nutrition_entry_item_id===source.item_id)||(source.event_food_id&&e.event_food_id===source.event_food_id)||(source.domain==='health'&&e.health_event_id===source.id)||(source.user_food_id&&e.user_food_id===source.user_food_id)||(foodId&&e.food_id===foodId))).sort((a,c)=>{const rank=(e:Evidence)=>e.component_id||e.nutrition_entry_item_id?0:e.event_food_id||e.health_event_id?1:e.user_food_id?2:3;return rank(a)-rank(c);});const selected=matches[0]??b.shared.find(e=>e.food_id===foodId&&e.classification_key===key&&e.reviewed_at);if(selected)evidence[key]={state:selected.state,provenance:selected.provenance,id:selected.id};}
  leaves.push({source,label:food?.name??label,food_id:food?.id??null,trusted:trusted&&!!food,categories:b.catalog.maps.filter(m=>m.food_id===foodId).map(m=>m.category_id),evidence});
 }
 function entry(domain:'nutrition'|'health',id:string,label:string){const anchor=b.anchors.find(a=>domain==='nutrition'?a.nutrition_entry_id===id:a.health_event_id===id),source:Leaf['source']={domain,id,...(anchor?{event_food_id:anchor.id}:{})};
  const components=anchor?b.components.filter(c=>c.event_food_id===anchor.id):[];
  if(components.length){const included=components.filter(c=>c.included);if(!included.length)emit(label,null,false,source);for(const c of included)emit(c.label,c.food_id,c.source!=='ai_inferred'||c.confirmed,{...source,component_id:c.id});return;}
  if(anchor){emit(anchor.label,anchor.food_id,!['ai','fuzzy'].includes(anchor.method)||anchor.confirmed,source);return;}
  const items=domain==='nutrition'?b.items.filter(i=>i.nutrition_entry_id===id):[];
  if(items.length){for(const i of items)emit(i.source_name,i.food_id,true,{...source,item_id:i.id,...(i.user_food_id?{user_food_id:i.user_food_id}:{})});return;}
  emit(label,null,false,source);
 }
 for(const e of b.entries)entry('nutrition',e.id,e.title??'Food log');for(const e of b.events)entry('health',e.id,e.title??'Food or drink log');return leaves;
}
export function assessDiet(b:Bundle):Assessment{
 const items=intakeLeaves(b),plan=b.version.plan;const exception=plan.weekly_exceptions.includes(new Date(`${b.date}T12:00:00Z`).getUTCDay())||plan.dated_exceptions.includes(b.date);
 const loggingComplete=b.coverage?.coverage_status==='complete'&&b.coverage.diet_intake_fingerprint===b.fingerprint&&(items.length>0||b.coverage.diet_no_intake);
 const reasons:Reason[]=[];
 for(const item of items){const reason=(kind:Reason['kind'],message:string,rule:Rule|null,evidence?:{id:string;provenance:string})=>reasons.push({kind,message,rule,source:item.source,...(evidence?{evidence_id:evidence.id,provenance:evidence.provenance}:{})});
  if(!item.trusted)reason('review',`${item.label}: food or ingredient identity needs review.`,null);
  else {
  const food=plan.rules.filter(r=>r.kind==='food'&&r.ref===item.food_id),category=plan.rules.filter(r=>r.kind==='category'&&item.categories.includes(r.ref)),selected=food.length?food:category;
  if(new Set(selected.map(r=>r.action)).size>1)reason('review',`${item.label}: conflicting rules need resolution.`,null);
  else if(selected[0]?.action==='exclude')reason('violation',`${item.label} is excluded by the ${food.length?'specific food':'category'} rule.`,selected[0]);
  else if(selected[0]?.action==='allow')reason('allowed',`${item.label} is allowed${food.length?' by a specific food rule, overriding broader categories':''}.`,selected[0]);
  else if(plan.mode==='exhaustive')reason(item.categories.length?'violation':'review',`${item.label} ${item.categories.length?'is not on the exhaustive allowed list':'has unresolved category information'}.`,null);
  else if(plan.rules.some(r=>r.kind==='category'&&r.action==='exclude')&&!item.categories.length)reason('review',`${item.label}: category information is unknown.`,null);
  }
  for(const r of plan.rules.filter(r=>r.kind==='ingredient')){const e=item.evidence[r.ref as typeof ingredientKeys[number]];if(e?.state==='present')reason('violation',`${item.label} contains ${r.ref}, which the diet excludes.`,r,e);else if(!e||e.state==='unknown')reason('review',`${item.label}: ${r.ref} ingredients are unknown.`,r,e);else reason('allowed',`${item.label}: ${r.ref} is recorded absent.`,r,e);}
 }
 const calculated_status=exception?'planned_exception':reasons.some(r=>r.kind==='violation')?'nonadherent':reasons.some(r=>r.kind==='review')?'needs_review':loggingComplete?'adherent':'incomplete';
 return {contract_version:1,calculation_version:'diet-v1',freshness:'current',enrollment_id:b.enrollment.id,rule_version_id:b.version.id,local_date:b.date,timezone:b.enrollment.timezone,calculated_status,logging_complete:!!loggingComplete,no_intake_confirmed:!!loggingComplete&&!items.length,confirmation_invalidated:!!b.coverage?.diet_intake_fingerprint&&!loggingComplete,exception,fingerprint:b.fingerprint,reasons,items};
}
