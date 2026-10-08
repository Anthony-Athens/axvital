import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,id} from '../diets/testing/intake-fixture.ts';
import {assessDiet} from '../diets/model.ts';
import {validateFactors,factorVersion,type Factor} from './factor-config.ts';
import {evidenceBase,foodEvidence,supplementEvidence,normalizedDose,usablePair,type SupplementDay} from './linked-evidence.ts';
const base=(f:Factor)=>evidenceBase(f,'2026-01-06','config1','America/New_York');
test('food/ingredient evidence is separate from permissions, positive precedence, review scope and absence completeness',()=>{
 const b=fixture(),f={source:'ingredient' as const,ref:'dairy',offset:-1 as const};
 assert.equal(base(f).source_date,'2026-01-05');assert.equal(foodEvidence(base(f),b).status,'unknown');
 b.private=[{id:id(801),nutrition_entry_item_id:b.items[0].id,classification_key:'dairy',state:'present',provenance:'Milk added to this serving'}];b.coverage=null;
 assert.equal(foodEvidence(base(f),b).status,'present');assert.equal(foodEvidence(base(f),b).complete,false);
 b.version.plan.weekly_exceptions=[1];b.version.plan.rules.push({kind:'food',ref:b.items[0].food_id!,action:'allow'});assert.equal(assessDiet(b).calculated_status,'planned_exception');assert.equal(foodEvidence(base(f),b).status,'present');
 b.private[0].state='absent';assert.equal(foodEvidence(base(f),b).status,'unknown');b.coverage={coverage_status:'complete',diet_intake_fingerprint:b.fingerprint,diet_no_intake:false,confirmed_at:'now'};assert.equal(foodEvidence(base(f),b).status,'absent');
 const sibling={...b.items[0],id:id(900),source_name:'Another portion'};b.items.push(sibling);assert.equal(foodEvidence(base(f),b).status,'unknown','per-item correction never applies to another serving');
 b.private[0]={...b.private[0],nutrition_entry_item_id:undefined,food_id:b.items[0].food_id};assert.equal(foodEvidence(base(f),b).status,'absent','explicit reusable canonical correction applies');
 b.coverage!.diet_intake_fingerprint='stale';assert.equal(foodEvidence(base(f),b).status,'unknown');
 const guessed=fixture();guessed.anchors=[{id:id(901),nutrition_entry_id:guessed.entries[0].id,health_event_id:null,food_id:guessed.items[0].food_id,label:'AI candidate',method:'ai',confirmed:false}];guessed.shared=[{id:id(902),food_id:guessed.items[0].food_id,classification_key:'dairy',state:'present',provenance:'Reviewed catalog candidate',reviewed_at:'now'}];assert.equal(foodEvidence(base(f),guessed).status,'unknown');guessed.private=[{id:id(903),event_food_id:id(901),classification_key:'dairy',state:'present',provenance:'I reviewed this actual serving'}];assert.equal(foodEvidence(base(f),guessed).status,'present');
});
test('components, canonical/category identities, alcohol presence with unknown quantities and no macro ingredient inference',()=>{
 const b=fixture(),parent=b.items[0].food_id!,rice=b.catalog.foods.find(f=>f.name==='Rice')!.id;
 b.anchors=[{id:id(750),nutrition_entry_id:b.entries[0].id,health_event_id:null,food_id:parent,label:'Composite',method:'exact',confirmed:true}];b.components=[{id:id(751),event_food_id:id(750),food_id:parent,label:'Chicken',source:'explicit',included:true,confirmed:true},{id:id(752),event_food_id:id(750),food_id:rice,label:'Rice',source:'explicit',included:true,confirmed:true}];
 assert.equal(foodEvidence(base({source:'food',ref:rice,offset:0}),b).status,'present');assert.equal(foodEvidence(base({source:'category',ref:b.catalog.maps.find(m=>m.food_id===rice)!.category_id,offset:0}),b).status,'present');
 const dish=id(950);b.catalog.foods.push({id:dish,name:'Canonical named dish'});b.anchors[0].food_id=dish;assert.equal(foodEvidence(base({source:'food',ref:dish,offset:0}),b).status,'present','component expansion retains named dish identity without adding parent quantities');
 assert.equal(foodEvidence(base({source:'ingredient',ref:'gluten',offset:0}),b).status,'unknown');
 Object.assign(b.items[0],{alcohol_grams:14});b.coverage=null;const alcohol=foodEvidence(base({source:'alcohol',offset:0}),b);assert.equal(alcohol.status,'present');assert.equal(alcohol.amount,null);assert.equal(alcohol.last_time,b.entries[0].consumed_at);
 Object.assign(b.items[0],{alcohol_grams:null});b.events=[{id:id(760),title:'Unresolved drink',event_date:b.date,event_type:'fluid'}];assert.equal(foodEvidence(base({source:'alcohol',offset:0}),b).status,'unknown');
 b.private=[{id:id(800),health_event_id:id(760),classification_key:'alcohol',state:'present',provenance:'Reviewed beverage label'}];assert.equal(foodEvidence(base({source:'alcohol',offset:0}),b).status,'present');assert.equal(foodEvidence(base({source:'alcohol',offset:0}),b).amount,null);
});
test('explicit product identity, supplement no-use confirmation, compatible units and unknown totals',()=>{
 const f=base({source:'supplement',ref:id(80),offset:-1});const b:SupplementDay={date:f.source_date,timezone:f.timezone,fingerprint:'current',coverage:null,events:[]};
 assert.equal(supplementEvidence(f,b).status,'unknown');b.coverage={complete:true,fingerprint:'current'};assert.equal(supplementEvidence(f,b).status,'absent');
 b.events=[{id:id(81),title:'Product',event_date:b.date,event_time:'10:00:00',supplement_product_id:id(80),dose_amount:1,dose_unit:'g'},{id:id(82),title:'Product',event_date:b.date,event_time:'18:00:00',supplement_product_id:id(80),dose_amount:500,dose_unit:'mg'}];assert.equal(supplementEvidence(f,b).amount,1500);assert.equal(supplementEvidence(f,b).last_time,'18:00:00');
 b.events.push({...b.events[0],id:id(84),supplement_product_id:null});assert.equal(supplementEvidence(f,b).status,'present');assert.equal(supplementEvidence(f,b).amount,null,'unreviewed product could be additional use of the selected product');b.events.pop();
 b.events[1].dose_unit='capsule';assert.equal(supplementEvidence(f,b).amount,null);assert.equal(supplementEvidence(f,b).status,'present');b.coverage=null;assert.equal(supplementEvidence(f,b).amount,null);
 b.events[0].supplement_product_id=id(83);b.events[1].supplement_product_id=null;assert.equal(supplementEvidence(f,b).status,'unknown');b.coverage={complete:true,fingerprint:'current'};assert.equal(supplementEvidence(f,b).status,'unknown','unreviewed product prevents no-use conclusion');
 assert.equal(normalizedDose(0,'mg'),null);assert.equal(normalizedDose(1,'glass'),null);assert.deepEqual(normalizedDose(500,'mcg'),{value:.5,unit:'mg'});
});
test('effective factor configurations, duplicate identity, missing/not-applicable/error and usable pairs',()=>{
 const initial={id:'initial',effective_from:'2026-01-01',revision:1,factors:[{source:'body_weight',offset:0}] as Factor[]},v={id:'later',effective_from:'2026-01-06',revision:2,factors:[{source:'alcohol',offset:-1}] as Factor[]};
 assert.equal(factorVersion([v],'2026-01-05',initial).id,'initial');assert.equal(factorVersion([v],'2026-01-06',initial).id,'later');assert.throws(()=>validateFactors([{source:'alcohol',offset:0},{source:'alcohol',offset:-1}]));assert.throws(()=>validateFactors([{source:'diet',offset:0,ref:'other-user-string'}]));
 assert.throws(()=>validateFactors([{source:'alcohol',offset:0},{source:'ingredient',ref:'alcohol',offset:0}]));assert.equal(usablePair({...base({source:'supplement',ref:id(80),offset:0}),status:'present'},{status:'recorded',value:0},'amount').usable,false);
 const e=base({source:'diet',ref:id(100),offset:0}),o={status:'recorded',value:0};for(const status of ['error','missing','not_applicable','unknown','needs_review','incomplete'])assert.equal(usablePair({...e,status},o).usable,false);
 for(const status of ['adherent','nonadherent','planned_exception','present','absent'])assert.equal(usablePair({...e,status},o).usable,true);assert.equal(usablePair({...e,status:'present'},{status:'not_observed',value:null}).usable,false);
});
