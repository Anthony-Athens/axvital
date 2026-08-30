import {createHash} from "node:crypto";
import type {AnalysisFamily,EligibilityState,PeriodQuality} from "./analysis-contract.ts";

export const RELIABILITY_POLICY_V1={version:1,methodVersion:1,minimumObservationsPerPeriod:10,maximumMissingFraction:0.4,iterations:2000,intervalLevel:0.95,maximumObservationsPerPeriod:366,earlyEndSupported:false} as const;
export const RELIABILITY_METHOD_REGISTRY_V1={repeated_continuous:{method:"moving_block_bootstrap_period_mean_difference_v1",methodVersion:1,supported:true},repeated_ordinal:{method:null,methodVersion:1,supported:false},count_frequency:{method:null,methodVersion:1,supported:false},binary_repeated:{method:null,methodVersion:1,supported:false},pre_post_performance:{method:null,methodVersion:1,supported:false},unsupported:{method:null,methodVersion:1,supported:false}} as const;
export type ReliabilityStatus="supported"|"insufficient_data"|"unsupported_method"|"unable_to_determine";
export type ReliabilityResult={version:1;methodVersion:1;status:ReliabilityStatus;method:"moving_block_bootstrap_period_mean_difference_v1"|null;estimate:{value:number;unit:string|null}|null;interval:{lower:number;upper:number;level:0.95}|null;nullReference:0|null;comparison:{state:"difference_detected"|"no_clear_difference"|"indeterminate"};sample:{baseline:number;intervention:number;baselineBlockLength:number|null;interventionBlockLength:number|null;iterations:number|null};assumptions:string[];limitations:string[]};
type Point={date:string;value:number};
const empty=(status:Exclude<ReliabilityStatus,"supported">,limitation:string,baseline=0,intervention=0):ReliabilityResult=>({version:1,methodVersion:1,status,method:null,estimate:null,interval:null,nullReference:null,comparison:{state:"indeterminate"},sample:{baseline,intervention,baselineBlockLength:null,interventionBlockLength:null,iterations:null},assumptions:[],limitations:[limitation]});
const mean=(values:number[])=>values.reduce((sum,value)=>sum+value/values.length,0);
function generator(seed:string){let state=parseInt(createHash("sha256").update(seed).digest("hex").slice(0,8),16)||0x9e3779b9;return()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296;};}
function blockMean(values:number[],blockLength:number,random:()=>number){const sample:number[]=[];while(sample.length<values.length){const start=Math.floor(random()*values.length);for(let offset=0;offset<blockLength&&sample.length<values.length;offset++)sample.push(values[(start+offset)%values.length]);}return mean(sample);}
const quantile=(sorted:number[],probability:number)=>{const index=(sorted.length-1)*probability,lower=Math.floor(index),upper=Math.ceil(index),weight=index-lower;return sorted[lower]*(1-weight)+sorted[upper]*weight;};
const excessiveMissing=(quality:PeriodQuality)=>quality.expectedObservations!==null&&quality.expectedObservations>0&&quality.missingObservations!==null&&quality.missingObservations/quality.expectedObservations>RELIABILITY_POLICY_V1.maximumMissingFraction;

/** Deterministic, bounded statistical layer over retained ordered observations.
 * Circular moving blocks preserve some adjacent-day dependence within each
 * period. This estimates period-mean separation, never a causal effect.
 */
export function estimateReliability(input:{family:AnalysisFamily;eligibility:EligibilityState;unit:string|null;digest:string;baseline:Point[];intervention:Point[];baselineQuality:PeriodQuality;interventionQuality:PeriodQuality;endedEarly:boolean}):ReliabilityResult{
 const counts=[input.baseline.length,input.intervention.length] as const,registered=RELIABILITY_METHOD_REGISTRY_V1[input.family];
 if(input.eligibility==="blocked_by_integrity"||input.eligibility==="unable_to_determine")return empty("unable_to_determine","RELIABILITY_EVIDENCE_UNAVAILABLE",...counts);
 if(!registered.supported||input.eligibility==="unsupported_design")return empty("unsupported_method",input.family==="repeated_ordinal"?"ORDINAL_RELIABILITY_UNSUPPORTED_V1":"RELIABILITY_METHOD_UNSUPPORTED_V1",...counts);
 if(input.eligibility!=="ready")return empty("insufficient_data","RELIABILITY_REQUIRES_DESCRIPTIVE_ELIGIBILITY",...counts);
 if(input.endedEarly&&!RELIABILITY_POLICY_V1.earlyEndSupported)return empty("unsupported_method","EARLY_END_RELIABILITY_UNSUPPORTED_V1",...counts);
 const valid=(points:Point[])=>points.length<=RELIABILITY_POLICY_V1.maximumObservationsPerPeriod&&points.every((point,index)=>Number.isFinite(point.value)&&(index===0||points[index-1].date<point.date));
 if(!valid(input.baseline)||!valid(input.intervention))return empty("unable_to_determine","ORDERED_RELIABILITY_INPUT_INVALID",...counts);
 if(input.baseline.length<RELIABILITY_POLICY_V1.minimumObservationsPerPeriod||input.intervention.length<RELIABILITY_POLICY_V1.minimumObservationsPerPeriod)return empty("insufficient_data","RELIABILITY_SAMPLE_MINIMUM_NOT_MET",...counts);
 if(excessiveMissing(input.baselineQuality)||excessiveMissing(input.interventionQuality))return empty("insufficient_data","RELIABILITY_MISSINGNESS_LIMIT_EXCEEDED",...counts);
 const baseline=input.baseline.map(point=>point.value),intervention=input.intervention.map(point=>point.value),baselineBlock=Math.max(2,Math.ceil(Math.sqrt(baseline.length))),interventionBlock=Math.max(2,Math.ceil(Math.sqrt(intervention.length))),random=generator(`${input.digest}:moving_block_bootstrap_period_mean_difference_v1`),replicates:number[]=[];
 for(let iteration=0;iteration<RELIABILITY_POLICY_V1.iterations;iteration++)replicates.push(blockMean(intervention,interventionBlock,random)-blockMean(baseline,baselineBlock,random));
 replicates.sort((a,b)=>a-b);const lower=quantile(replicates,0.025),upper=quantile(replicates,0.975),estimate=mean(intervention)-mean(baseline);
 return {version:1,methodVersion:1,status:"supported",method:"moving_block_bootstrap_period_mean_difference_v1",estimate:{value:estimate,unit:input.unit},interval:{lower,upper,level:0.95},nullReference:0,comparison:{state:lower>0||upper<0?"difference_detected":"no_clear_difference"},sample:{baseline:baseline.length,intervention:intervention.length,baselineBlockLength:baselineBlock,interventionBlockLength:interventionBlock,iterations:RELIABILITY_POLICY_V1.iterations},assumptions:["ORDERED_WITHIN_PERIOD","PERIODS_SAMPLED_SEPARATELY","ALL_ELIGIBLE_OBSERVED_DAYS_INCLUDED"],limitations:["SERIAL_CORRELATION_PARTIALLY_MODELED","BASELINE_TREND_NOT_ADJUSTED","SELECTIVE_COMPLETE_CASE","NO_CAUSAL_IDENTIFICATION"]};
}
