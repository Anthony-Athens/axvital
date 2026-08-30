import test from "node:test";
import assert from "node:assert/strict";
import {estimateReliability,RELIABILITY_POLICY_V1} from "./reliability.ts";
import type {PeriodQuality} from "./analysis-contract.ts";

const quality=(observed:number,expected=observed):PeriodQuality=>({readCompleteness:"complete",expectedObservations:expected,capturedObservations:observed,eligibleObservations:observed,missingObservations:expected-observed,cadence:"daily",observedDates:[],sourceMissingness:null,adapterVersion:1});
const points=(values:number[],month="01")=>values.map((value,index)=>({date:`2026-${month}-${String(index+1).padStart(2,"0")}`,value}));
const estimate=(baseline:number[],intervention:number[],options:Partial<Parameters<typeof estimateReliability>[0]>={})=>estimateReliability({family:"repeated_continuous",eligibility:"ready",unit:"kg",digest:"a".repeat(64),baseline:points(baseline),intervention:points(intervention,"02"),baselineQuality:quality(baseline.length),interventionQuality:quality(intervention.length),endedEarly:false,...options});

test("moving-block reliability is deterministic and detects a separated period difference",()=>{
 const baseline=[10,10.2,9.9,10.1,10,10.2,9.8,10.1,9.9,10],intervention=baseline.map(value=>value+3);
 const first=estimate(baseline,intervention),second=estimate(baseline,intervention);
 assert.deepEqual(first,second);assert.equal(first.status,"supported");assert.equal(first.comparison.state,"difference_detected");assert.ok(first.interval!.lower>0);assert.equal(first.sample.iterations,RELIABILITY_POLICY_V1.iterations);
});

test("an interval containing zero is an uncertain difference, not proof of no change",()=>{
 const values=[8,12,8,12,8,12,8,12,8,12,8,12];
 const result=estimate(values,[12,8,12,8,12,8,12,8,12,8,12,8]);
 assert.equal(result.status,"supported");assert.equal(result.comparison.state,"no_clear_difference");assert.ok(result.interval!.lower<=0&&result.interval!.upper>=0);
});

test("reliability has a separate sample floor and missingness gate",()=>{
 assert.deepEqual(estimate(Array(9).fill(1),Array(10).fill(2)).limitations,["RELIABILITY_SAMPLE_MINIMUM_NOT_MET"]);
 const result=estimate(Array(10).fill(1),Array(10).fill(2),{baselineQuality:quality(10,20)});
 assert.equal(result.status,"insufficient_data");assert.deepEqual(result.limitations,["RELIABILITY_MISSINGNESS_LIMIT_EXCEEDED"]);
});

test("ordinal, early-ended, invalid order, and unavailable evidence remain explicit",()=>{
 assert.deepEqual(estimate(Array(10).fill(1),Array(10).fill(2),{family:"repeated_ordinal"}).limitations,["ORDINAL_RELIABILITY_UNSUPPORTED_V1"]);
 assert.deepEqual(estimate(Array(10).fill(1),Array(10).fill(2),{endedEarly:true}).limitations,["EARLY_END_RELIABILITY_UNSUPPORTED_V1"]);
 const unordered=points(Array(10).fill(1));[unordered[0],unordered[1]]=[unordered[1],unordered[0]];
 assert.deepEqual(estimate(Array(10).fill(1),Array(10).fill(2),{baseline:unordered}).limitations,["ORDERED_RELIABILITY_INPUT_INVALID"]);
 assert.equal(estimate(Array(10).fill(1),Array(10).fill(2),{eligibility:"unable_to_determine"}).status,"unable_to_determine");
});

test("supported inference records serial-dependence, trend, complete-case, and causal limits",()=>{
 const result=estimate([1,1,2,2,3,3,4,4,5,5],[2,2,3,3,4,4,5,5,6,6]);
 assert.equal(result.status,"supported");assert.deepEqual(result.assumptions,["ORDERED_WITHIN_PERIOD","PERIODS_SAMPLED_SEPARATELY","ALL_ELIGIBLE_OBSERVED_DAYS_INCLUDED"]);
 for(const code of ["SERIAL_CORRELATION_PARTIALLY_MODELED","BASELINE_TREND_NOT_ADJUSTED","SELECTIVE_COMPLETE_CASE","NO_CAUSAL_IDENTIFICATION"])assert.ok(result.limitations.includes(code));
});
