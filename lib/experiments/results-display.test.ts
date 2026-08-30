import test from "node:test";
import assert from "node:assert/strict";
import {testHooks} from "./testing/tsx-hooks.ts";
import {retainedResultsDisplay,formatResultValue} from "./results-display.ts";
import {parseResultsResponse,parseRevisionResponse} from "./results-response.ts";
import {adherencePresentation,groupedLimitations,movementCopy,orderedLimitations,resultCopy} from "./results-copy.ts";
const hooks=testHooks();
const {fixtureCapture,fixtureResult,fixtureMetadata,fixtureVariant}=await import("./testing/results-fixture.ts");
const {replayDurableCapture}=await import("./durable-evidence.ts");hooks.deregister();
test("display contract takes verified retained units/labels without changing analysis replay",async()=>{
 const {row}=fixtureCapture(),bundle=await replayDurableCapture(row),before=structuredClone(bundle);
 const display=retainedResultsDisplay(bundle.input);assert.equal(display.version,2);assert.equal(display.outcomeLabel,"Logged protein");assert.equal(display.unit,"g");if(display.version===2){assert.equal(display.experimentName,"Protein 15 & Logged protein");assert.equal(display.interventionLabel,"Protein ≥ 15 g/day");assert.equal(display.design.baselineDays,7);assert.equal(display.design.plannedDays,14);assert.equal(display.design.activeDays,14);}assert.deepEqual(bundle,before);
 const config=bundle.input.startSnapshot!.configuration;
 config.question="Measured in made-up units";
 const primary=(config.outcomes as {definition:{label:string;unit:string}}[])[0];primary.definition.label="Retained historical label";
 assert.equal(retainedResultsDisplay(bundle.input).outcomeLabel,"Retained historical label");primary.definition.unit="guessed";
 assert.deepEqual(retainedResultsDisplay(bundle.input),{version:1,outcomeLabel:"Outcome",unit:null,scaleLabel:null});
});
for(const key of ["energy_score","mood_score","sleep_quality_score"])test(`real retained ${key} DTO preserves ordinal ranks with authoritative scale`,async()=>{
 const result=await fixtureResult(key);assert.equal(result.eligibility.state,"ready");assert.equal(result.facts?.baseline.kind,"ordinal");assert.equal(result.facts?.relativeChangePercent,null);assert.equal(result.display?.unit,null);assert.ok(result.display?.scaleLabel);assert.deepEqual(parseResultsResponse(result),result);
});
test("older display-less DTO and future display version fall back without guessing",async()=>{
 const old=await fixtureResult();delete old.display;assert.equal(parseResultsResponse(old).display,undefined);
 assert.equal(parseResultsResponse({...old,display:{version:99,unit:"guessed"}}).display,null);
});
test("response parser rejects malformed results, private root fields, and invalid metadata",async()=>{
 const dto=await fixtureResult();for(const invalid of [{...dto,analysisRevision:0},{...dto,evidence_text:"private"},{...dto,outcomeQuality:null},{...dto,facts:{...dto.facts,absoluteChange:Infinity}},{...dto,eligibility:{state:"unknown",reasons:[]}}])assert.throws(()=>parseResultsResponse(invalid),/supported public contract/);
 assert.deepEqual(parseRevisionResponse(fixtureMetadata([dto])),fixtureMetadata([dto]));assert.throws(()=>parseRevisionResponse({...fixtureMetadata([dto]),nextBefore:20}),/supported public contract/);
});
test("formatting preserves unknown/zero, avoids false zero precision and adds only authoritative units",()=>{
 assert.equal(formatResultValue(null,"g"),"Unknown");assert.equal(formatResultValue(0,"g"),"0 g");assert.match(formatResultValue(0.000001,"g"),/e-6 g/);assert.equal(formatResultValue(12.5,"g"),"12.5 g");assert.equal(formatResultValue(12),"12");
});
test("limitation priority preserves every item and fallback never hides an unfamiliar code",()=>{
 const codes=["CAPTURE_AT_ONE_DATABASE_READ_SNAPSHOT","FUTURE_WARNING","EARLY_END_MAY_BE_INFORMATIVE","NO_CAUSAL_IDENTIFICATION"];
 const ordered=orderedLimitations(codes);assert.equal(ordered[0],"EARLY_END_MAY_BE_INFORMATIVE");assert.deepEqual([...ordered].sort(),[...codes].sort());assert.equal(resultCopy("FUTURE_WARNING"),"future warning.");
});
test("consumer presentation helpers retain neutral movement, eligible adherence semantics and every limitation",()=>{
 assert.equal(movementCopy("Body Weight","lower","indeterminate").title,"Body Weight decreased");assert.equal(movementCopy("Body Weight","lower","indeterminate").desirability,null);
 assert.deepEqual(adherencePresentation({eligible:28,adherent:24,nonAdherent:2,unknown:2}),{percent:86,summary:"24 of 28 eligible opportunities followed",detail:"2 not followed · 2 could not be confirmed"});assert.equal(adherencePresentation({eligible:0,adherent:0,nonAdherent:0,unknown:0}).percent,null);
 const codes=["MISSING_OBSERVATIONS_NOT_IMPUTED","PAUSE_TOUCHED_DAYS_EXCLUDED","NO_CAUSAL_IDENTIFICATION","FUTURE_WARNING"],groups=groupedLimitations(codes);assert.deepEqual([...groups.data,...groups.experiment,...groups.interpretation].sort(),[...codes].sort());
});
test("retained source-edit replay preserves revision one and explicit recapture can change revision two",async()=>{
 const capture=fixtureCapture(),before=await replayDurableCapture(capture.row);capture.raw.intervention.nutrition.items[0].protein_grams=999;
 assert.deepEqual(await replayDurableCapture(capture.row),before);
 const second=await fixtureResult("nutrition_protein_grams",2,30);assert.equal(second.analysisRevision,2);assert.notEqual(second.facts?.absoluteChange,before.result.facts?.absoluteChange);
});
test("browser scenario DTOs replay real eligibility and aligned early-end/pause populations",async()=>{
 for(const state of ["insufficient_data","unable_to_determine","unsupported_design","blocked_by_integrity"]){const result=await fixtureVariant(state);assert.equal(result.eligibility.state,state);assert.equal(result.facts,null);parseResultsResponse(result);}
 const result=await fixtureVariant("early_pause");assert.equal(result.eligibility.state,"ready");assert.equal(result.outcomeQuality.intervention.expected,8);assert.equal(result.exposureQuality?.eligible,8);assert.equal(result.exposureQuality?.nonAdherent,0);assert.ok(result.limitations.includes("PAUSE_TOUCHED_DAYS_EXCLUDED"));
});
test("Body Weight and partial adherence presentation use only engine-produced public facts",async()=>{
 const weight=await fixtureResult("body_weight");assert.equal(weight.eligibility.state,"ready");assert.equal(weight.display?.outcomeLabel,"Body Weight");assert.equal(weight.display?.unit,"kg");assert.equal(weight.facts?.neutralMovement,"lower");assert.ok((weight.facts?.absoluteChange??0)<0);
 const partial=await fixtureVariant("partial_adherence");assert.equal(partial.eligibility.state,"ready");assert.deepEqual({eligible:partial.exposureQuality?.eligible,adherent:partial.exposureQuality?.adherent,nonAdherent:partial.exposureQuality?.nonAdherent,unknown:partial.exposureQuality?.unknown},{eligible:14,adherent:12,nonAdherent:2,unknown:0});assert.equal(adherencePresentation(partial.exposureQuality).percent,86);
 const unknown=await fixtureVariant("unknown_adherence");assert.equal(unknown.eligibility.state,"insufficient_data");assert.equal(unknown.exposureQuality?.unknown,2);assert.equal(unknown.exposureQuality?.nonAdherent,0);
});
