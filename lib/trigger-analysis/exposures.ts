import type { ExposureDay, ExposureDefinition } from "./types.ts";
const nums=(days:ExposureDay[],key:keyof ExposureDay)=>days.map(x=>x[key]).filter((x):x is number=>typeof x==="number"&&Number.isFinite(x));
const mean=(xs:number[])=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
const avg=(key:keyof ExposureDay)=>(days:ExposureDay[])=>mean(nums(days,key));
const adherence=(done:keyof ExposureDay,total:keyof ExposureDay)=>(days:ExposureDay[])=>{const completed=nums(days,done).reduce((a,b)=>a+b,0),scheduled=nums(days,total).reduce((a,b)=>a+b,0);return scheduled?100*completed/scheduled:null};
const windows=[24,48,72,168]as const;
export const exposureDefinitions:ExposureDefinition[]=[
 {key:"sleep_quality",label:"Sleep quality",category:"sleep",dataType:"continuous",unit:"/4",supportedWindows:[...windows],minimumEpisodeCount:3,minimumComparisonCount:7,minimumDifference:.35,value:avg("sleepQuality"),absenceReliable:false},
 {key:"energy",label:"Energy",category:"energy",dataType:"continuous",unit:"/10",supportedWindows:[...windows],minimumEpisodeCount:3,minimumComparisonCount:7,minimumDifference:.6,value:avg("energy"),absenceReliable:false},
 {key:"mood",label:"Mood",category:"mood",dataType:"continuous",unit:"/10",supportedWindows:[...windows],minimumEpisodeCount:3,minimumComparisonCount:7,minimumDifference:.6,value:avg("mood"),absenceReliable:false},
 {key:"calories",label:"Calories logged",category:"nutrition",dataType:"continuous",unit:"kcal/day",supportedWindows:[...windows],minimumEpisodeCount:3,minimumComparisonCount:7,minimumDifference:150,value:avg("calories"),absenceReliable:false},
 {key:"protein",label:"Protein logged",category:"nutrition",dataType:"continuous",unit:"g/day",supportedWindows:[...windows],minimumEpisodeCount:3,minimumComparisonCount:7,minimumDifference:15,value:avg("protein"),absenceReliable:false},
 {key:"caffeine",label:"Caffeine logged",category:"nutrition",dataType:"continuous",unit:"mg/day",supportedWindows:[...windows],minimumEpisodeCount:3,minimumComparisonCount:7,minimumDifference:30,value:avg("caffeine"),absenceReliable:false},
 {key:"alcohol",label:"Alcohol reported",category:"nutrition",dataType:"binary",unit:"%",supportedWindows:[...windows],minimumEpisodeCount:3,minimumComparisonCount:7,minimumDifference:20,value:days=>{const values=days.map(x=>x.alcohol).filter((x):x is boolean=>x!==null);return values.length?100*values.filter(Boolean).length/values.length:null},absenceReliable:true},
 {key:"workout_minutes",label:"Workout duration",category:"workout",dataType:"continuous",unit:"min/day",supportedWindows:[...windows],minimumEpisodeCount:3,minimumComparisonCount:7,minimumDifference:20,value:avg("workoutMinutes"),absenceReliable:true},
 {key:"workout_volume",label:"Training volume",category:"workout",dataType:"continuous",unit:null,supportedWindows:[...windows],minimumEpisodeCount:3,minimumComparisonCount:7,minimumDifference:100,value:avg("workoutVolume"),absenceReliable:true},
 {key:"habit_adherence",label:"Habit adherence",category:"habit",dataType:"adherence",unit:"%",supportedWindows:[...windows],minimumEpisodeCount:3,minimumComparisonCount:7,minimumDifference:15,value:adherence("habitCompleted","habitScheduled"),absenceReliable:true},
 {key:"protocol_adherence",label:"Protocol adherence",category:"protocol",dataType:"adherence",unit:"%",supportedWindows:[...windows],minimumEpisodeCount:3,minimumComparisonCount:7,minimumDifference:15,value:adherence("protocolCompleted","protocolScheduled"),absenceReliable:true},
 {key:"precursor_symptoms",label:"Symptoms logged",category:"symptom",dataType:"count",unit:"per tracked day",supportedWindows:[...windows],minimumEpisodeCount:3,minimumComparisonCount:7,minimumDifference:1,value:avg("symptomCount"),absenceReliable:true},
];
