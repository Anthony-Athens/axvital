// Explicitly disposable PGlite only. No .env, network credentials or remote mutations.
import {linkedDatabase,databaseClient,A} from '../lib/experiments/testing/linked-database.ts';
import {blankPlan} from '../lib/diets/model.ts';
import {readObservationalResults} from '../lib/experiments/observational-results-service.ts';
import {shiftDate} from '../lib/measurements/time-window.ts';
const db=await linkedDatabase();
const rpc=async(name,args)=>(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) r`,args.map(v=>typeof v==='object'?JSON.stringify(v):v))).rows[0].r;
try{
 await db.exec(`insert into public.subscriptions(user_id,plan,status) values('${A}','premium','active');`);
 const chicken=crypto.randomUUID(),rice=crypto.randomUUID(),grains=crypto.randomUUID();await db.query("insert into public.food_categories(id,name,slug) values($1,'Synthetic grain category','release-grains')",[grains]);
 for(const [id,name] of [[chicken,'Synthetic chicken'],[rice,'Synthetic rice']])await db.query('insert into public.foods(id,slug,name) values($1,$2,$3)',[id,'release-'+id,name]);await db.query('insert into public.food_category_map(food_id,category_id) values($1,$2)',[rice,grains]);
 await db.exec(`select set_config('request.jwt.claim.sub','${A}',false);set role authenticated;`);
 const diet=await rpc('save_diet_v1',['definition',{id:crypto.randomUUID(),revision:0,draft:{...blankPlan(),name:'Synthetic release diet',rules:[{kind:'category',ref:grains,action:'exclude'},{kind:'food',ref:rice,action:'allow'},{kind:'ingredient',ref:'dairy',action:'exclude'}],weekly_exceptions:[6]},archived:false}]);
 const enrollment=await rpc('save_diet_v1',['enroll',{id:crypto.randomUUID(),diet_id:diet.id,definition_revision:diet.revision,start_date:'2026-01-01',end_date:null,timezone:'America/New_York'}]);
 const product=await rpc('save_supplement_review_v1',['product',{name:'Synthetic benchmark product',formulation:'Fixture formulation'}]);
 for(const food of [chicken,rice])for(const key of ['dairy','gluten','alcohol'])await rpc('save_diet_v1',['classification',{subject:'food_id',id:food,key,state:'absent',provenance:'Synthetic reviewed preparation',historical_ack:true}]);
 const metric=await rpc('save_observational_v1',['metric',{name:'Synthetic release intensity',description:'',kind:'rating',unit:'rating',min:0,max:4,anchors:{0:'None',4:'Most'},direction:'neither',instructions:''}]);
 const config={id:crypto.randomUUID(),title:'Synthetic ninety-day study',question:'Fixture association',start_date:'2026-01-01',end_date:'2026-03-31',timezone:'America/New_York',entry_offset:-1,metric_id:metric.id,outcome_source:null,factors:[{source:'body_weight',offset:0},{source:'diet',ref:enrollment.id,offset:0},{source:'food',ref:rice,offset:0},{source:'ingredient',ref:'dairy',offset:0},{source:'ingredient',ref:'gluten',offset:0},{source:'alcohol',offset:0},{source:'supplement',ref:product.id,offset:0}],status:'draft',revision:0};let study=await rpc('save_observational_v1',['study',config]);study=await rpc('save_observational_v1',['study',{...config,revision:study.revision,status:'active'}]);
 for(let i=0;i<90;i++){const date=shiftDate('2026-01-01',i),entry=crypto.randomUUID(),anchor=crypto.randomUUID();
  await db.query("insert into public.nutrition_entries(id,user_id,title,consumed_at) values($1,$2,'Synthetic composite meal',$3)",[entry,A,date+'T18:00:00Z']);await db.query("insert into public.health_event_foods(id,user_id,nutrition_entry_id,label,method,confirmed) values($1,$2,$3,'Synthetic composite','exact',true)",[anchor,A,entry]);
  for(const food of [chicken,rice])await db.query("insert into public.health_event_food_components(user_id,event_food_id,food_id,label,source,confirmed,included) values($1,$2,$3,'Synthetic component','explicit',true,true)",[A,anchor,food]);
  const drink=crypto.randomUUID();await db.query("insert into public.health_events(id,user_id,title,event_date,event_time,event_type) values($1,$2,'Synthetic beverage',$3,'20:00','fluid')",[drink,A,date]);await rpc('save_diet_v1',['classification',{subject:'health_event_id',id:drink,key:'alcohol',state:i%3===0?'present':'absent',provenance:'Synthetic beverage review',historical_ack:true}]);
  await rpc('save_diet_v1',['identity',{subject:'health_event_id',id:drink,food_id:chicken,provenance:'Synthetic resolved beverage identity',historical_ack:true}]);
  if(i%2===0)await db.query("insert into public.health_events(user_id,title,event_date,event_time,event_type,dose_amount,dose_unit,supplement_product_id) values($1,'Synthetic supplement',$2,'21:00','supplement',500,'mg',$3)",[A,date,product.id]);
  await db.query("insert into public.daily_checkins(user_id,checkin_date,weight_source_value,weight_source_unit,weight_provenance_version) values($1,$2,$3,'kg',1)",[A,date,80-i/100]);await rpc('save_observational_v1',['observation',{study_id:study.id,observed_date:date,status:i%11===0?'not_observed':'recorded',value:i%11===0?null:i%5,observer:'',coverage:'most',note:'',expected_updated_at:null}]);
  if(i%7!==0){const intake=await rpc('read_intake_day_v1',[date,study.timezone]);await rpc('confirm_intake_day_v1',[{date,timezone:study.timezone,fingerprint:intake.fingerprint,no_intake:false}]);}const supp=await rpc('read_supplement_day_v1',[date,study.timezone]);await rpc('save_supplement_review_v1',['confirm',{date,timezone:study.timezone,fingerprint:supp.fingerprint}]);
 }
 const correction=await db.query('select id from public.health_event_food_components where food_id=$1 limit 1',[rice]);
 for(const delay of [0,20]){for(const scenario of ['initial','range','correction']){
  await rpc('save_diet_v1',['classification',{subject:'component_id',id:correction.rows[0].id,key:'dairy',state:scenario==='correction'?'present':'absent',provenance:'Synthetic serving correction',historical_ack:true}]);
  const counts={queries:0,rpcs:{}},raw=databaseClient(db),client={from:(table)=>{counts.queries++;return raw.from(table);},rpc:async(name,args)=>{counts.rpcs[name]=(counts.rpcs[name]??0)+1;if(delay)await new Promise(r=>setTimeout(r,delay));return raw.rpc(name,args);}};
  const start=performance.now(),response=await readObservationalResults(client,A,study,scenario==='range'?'2026-03-01':'2026-01-01','2026-03-31');
  console.log(JSON.stringify({environment:'disposable PGlite; synthetic Supabase transport',simulatedRpcLatencyMs:delay,scenario,elapsedMs:Math.round(performance.now()-start),dates:response.results.rows.length,factors:7,counts,sourceRows:{compositeMeals:90,components:180,beverages:90,supplements:45,weights:90,outcomes:90},pairs:response.results.segments.filter(s=>s.measurement==='status').map(s=>({source:s.factor.source,n:s.pairs.length}))}));
 }}
}finally{await db.close();}
