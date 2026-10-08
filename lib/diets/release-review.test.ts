import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,id} from './testing/intake-fixture.ts';
import {assessDiet} from './model.ts';
test('unconfirmed identity cannot establish an ingredient violation from catalog facts; actual-serving review can',()=>{
 const b=fixture();b.version.plan.rules=[{kind:'ingredient',ref:'dairy',action:'exclude'}];b.anchors=[{id:id(800),nutrition_entry_id:b.entries[0].id,health_event_id:null,label:'Unconfirmed AI sauce',food_id:id(1),method:'ai',confirmed:false}];b.shared=[{id:id(801),food_id:id(1),classification_key:'dairy',state:'present',provenance:'Synthetic shared review',reviewed_at:'2026-01-01'}];
 assert.equal(assessDiet(b).calculated_status,'needs_review');assert.equal(assessDiet(b).reasons.some(r=>r.kind==='violation'),false);
 b.private=[{id:id(802),event_food_id:id(800),classification_key:'dairy',state:'present',provenance:'Synthetic actual serving review'}];assert.equal(assessDiet(b).calculated_status,'nonadherent');
 b.private=[];b.anchors[0].confirmed=true;assert.equal(assessDiet(b).calculated_status,'nonadherent');
});
