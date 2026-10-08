import {calculateResults,type OutcomeRecord,type OutcomeDefinition} from '../observational-results.ts';
import {evidenceBase,type LinkedResponse} from '../linked-evidence.ts';
import type {Study} from '../observational.ts';
import {shiftDate} from '../../measurements/time-window.ts';
export const resultStudy:Study={id:'dddddddd-dddd-4ddd-addd-dddddddddddd',title:'Synthetic results demonstration',question:'How does recorded intensity vary alongside reviewed exposure?',start_date:'2026-01-01',end_date:'2026-01-20',timezone:'America/New_York',entry_offset:0,metric_id:'eeeeeeee-eeee-4eee-aeee-eeeeeeeeeeee',outcome_source:null,factors:[{source:'ingredient',ref:'dairy',offset:-1},{source:'alcohol',offset:0},{source:'body_weight',offset:0}],status:'active',revision:1};
export function resultsFixture(state='ready',start='2026-01-01',end='2026-01-20'){
 const definition:OutcomeDefinition={id:resultStudy.metric_id!,version:1,name:'Synthetic intensity',kind:'rating',unit:'rating',min:0,max:4,anchors:{0:'None',4:'Most recorded intensity'},direction:'neither'};
 const linked:LinkedResponse={study:resultStudy,versions:[],daily:[],history:[]},outcomes=new Map<string,OutcomeRecord>();
 for(let i=0;i<20;i++){const date=shiftDate('2026-01-01',i),factors=resultStudy.factors.map(f=>{const e=evidenceBase(f,date,'initial:'+resultStudy.id,resultStudy.timezone);return {...e,status:f.source==='body_weight'?'recorded':i<10?'present':'absent',value:f.source==='body_weight'?70+i/10:i<10?'present':'absent',unit:f.source==='body_weight'?'kg':null,complete:true};});linked.history.push({date,factors});if(state!=='empty')outcomes.set(date,{metric_id:definition.id,status:'recorded',value:state==='edited'?1:i<10?4:0,coverage:'partial',note:i===9?'Synthetic dated context; not an adjustment':''});}
 linked.history=linked.history.filter(row=>row.date>=start&&row.date<=end);
 return {study:resultStudy,catalog:{catalog:{foods:[],categories:[],maps:[],library:[]},enrollments:[],diets:[],products:[]},calculated_at:'2026-10-08T12:00:00Z',results:calculateResults(linked,outcomes,definition)};
}
