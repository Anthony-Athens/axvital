import "server-only";
import {createHash} from "node:crypto";
import {measurement,type MeasurementDefinition} from "../measurements/registry.ts";
import {validateOutcome,type OutcomeInput} from "../measurements/validation.ts";
import {evaluateReadiness} from "../measurements/readiness-policies.ts";
import {historicalWindow,shiftDate,dateInZone,isLogicalDate} from "../measurements/time-window.ts";
import {supportedFrozenTarget,evaluateFrozenNutritionDay} from "../nutrition/frozen-target.ts";
import {isObject,isUuid} from "../rules/validation.ts";
import type {SourceResult} from "../measurements/observations.ts";
import type {AnalysisInput,AnalysisBundle,AnalysisResult,AnalysisReason,AnalysisFamily,PeriodSummary,PeriodQuality,EligibilityState,Direction} from "./analysis-contract.ts";
import {reconcileLifecycle} from "./lifecycle.ts";
import {estimateReliability} from "./reliability.ts";

// A small descriptive-method floor, not a power calculation or evidence-strength score.
export const ANALYSIS_POLICY_V1={minimumObservationsPerPeriod:5,exposureUnknownAllowed:0,primaryPopulation:"all_observed_intervention_days"} as const;
export const reason=(code:string,scope:AnalysisReason["scope"],state:AnalysisReason["state"]):AnalysisReason=>({code,scope,state});
const object=(v:unknown)=>isObject(v)?v:{};
function canonical(value:unknown):unknown {
  if(Array.isArray(value))return value.map(canonical);
  if(isObject(value))return Object.fromEntries(Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>[k,canonical(value[k])]));
  return value;
}
export function analysisDigest(input:AnalysisInput) {return createHash("sha256").update(JSON.stringify(canonical(input))).digest("hex");}
export function analysisFamily(definition:MeasurementDefinition|undefined):AnalysisFamily {
  if(!definition)return "unsupported";
  if(definition.key==="exercise_estimated_1rm")return "pre_post_performance";
  if(definition.unit==="count"&&definition.grain==="window")return "count_frequency";
  if(definition.scale==="ordinal"||definition.scale==="rating")return "repeated_ordinal";
  return definition.scale==="ratio"?"repeated_continuous":"unsupported";
}
export function inspectAnalysisPlan(input:AnalysisInput) {
  const issues:AnalysisReason[]=[];let outcome:OutcomeInput|null=null,definition:MeasurementDefinition|undefined;
  const frozen=object(input.startSnapshot?.configuration),source=object(object(frozen.intervention).configuration);
  if(![1,2].includes(input.analysisContractVersion)||input.analysisPolicyVersion!==input.analysisContractVersion||input.readinessPolicyVersion!==1)issues.push(reason("UNSUPPORTED_CONTRACT_VERSION","input","blocked_by_integrity"));
  const lifecycle=input.analysisPolicyVersion===2&&input.lifecycle?reconcileLifecycle(frozen,input.experiment.status,input.experiment.phase,input.lifecycle,input.cutoff):null;
  if(input.analysisPolicyVersion===2){
    if(!lifecycle||!input.durableCapture)issues.push(reason("DURABLE_LIFECYCLE_CAPTURE_REQUIRED","input","blocked_by_integrity"));
    for(const code of lifecycle?.issues??[])issues.push(reason(code,"design",code==="UNSUPPORTED_TERMINAL_STATE"?"unsupported_design":["AUTHORITATIVE_END_REQUIRED","NO_COMPLETE_ACTIVE_DAYS"].includes(code)?"insufficient_data":"blocked_by_integrity"));
    if(input.lifecycle?.events.some(e=>e.event_type==="intervention_started"&&e.metadata?.config_revision!==input.experiment.revision))issues.push(reason("LIFECYCLE_CONFIG_REVISION_MISMATCH","input","blocked_by_integrity"));
  }
  if(!isUuid(input.experiment.id)||!Number.isSafeInteger(input.experiment.revision)||input.experiment.revision<1||input.experiment.modelVersion!==2)issues.push(reason("INVALID_EXPERIMENT_IDENTITY","input","blocked_by_integrity"));
  if(!input.startSnapshot||input.startSnapshot.snapshot_version!==1||input.startSnapshot.config_revision!==input.experiment.revision||frozen.model_version!==2||!isUuid(source.id))issues.push(reason("START_SNAPSHOT_OR_REVISION_MISMATCH","input","blocked_by_integrity"));
  if(object(frozen.intervention).type==="nutrition_target"&&(!supportedFrozenTarget(source.definition)||!Number.isSafeInteger(source.revision)||Number(source.revision)<1))issues.push(reason("UNSUPPORTED_FROZEN_NUTRITION_TARGET","design","unsupported_design"));
  if(input.reproducibility!=="captured_inputs_only"||!Number.isFinite(Date.parse(input.cutoff))||new Date(input.cutoff).toISOString()!==input.cutoff)issues.push(reason("INVALID_REPRODUCIBLE_CUTOFF","input","blocked_by_integrity"));
  const primary=(Array.isArray(frozen.outcomes)?frozen.outcomes:[]).map(object).filter(o=>o.outcome_role==="primary");
  if(primary.length!==1)issues.push(reason("PRIMARY_OUTCOME_REQUIRED","input","blocked_by_integrity"));
  else {
    const raw=primary[0];definition=measurement(String(raw.registry_key),Number(raw.registry_version));
    if(!definition?.enabled)issues.push(reason("UNSUPPORTED_OUTCOME_TYPE","design","unsupported_design"));
    if(definition?.enabled)try {const candidate=Object.fromEntries(Object.entries(raw).filter(([k])=>!["id","definition","target_label"].includes(k)));validateOutcome(candidate);outcome=candidate;}catch{issues.push(reason("INVALID_FROZEN_OUTCOME","input","blocked_by_integrity"));}
    const frozenDefinition=object(raw.definition);
    if(definition&&["key","version","unit","scale","grain","sourceAdapter","target","aggregations","formula"].some(k=>JSON.stringify(canonical(frozenDefinition[k]))!==JSON.stringify(canonical((definition as unknown as Record<string,unknown>)[k]))))issues.push(reason("OUTCOME_DEFINITION_VERSION_MISMATCH","input","blocked_by_integrity"));
  }
  const family=analysisFamily(definition);
  let method:string|null=null;
  if(family==="pre_post_performance")issues.push(reason("PRE_POST_ASSESSMENT_PROTOCOL_UNAVAILABLE","design","unsupported_design"));
  else if(family==="count_frequency")issues.push(reason("EVENT_SURVEILLANCE_DENOMINATOR_UNAVAILABLE","design","unsupported_design"));
  else if(definition?.sourceAdapter==="checkins"&&family==="repeated_ordinal")method="ordinal_median_interval_distribution_v1";
  else if(definition?.key==="body_weight"&&definition.version===2&&["average","median"].includes(outcome?.aggregation_method??""))method="verified_daily_weight_mean_median_v1";
  else if(definition?.sourceAdapter==="nutrition"&&family==="repeated_continuous"&&outcome?.aggregation_method==="average")method="complete_day_mean_median_v1";
  else issues.push(reason("UNSUPPORTED_OUTCOME_CADENCE_OR_AGGREGATION","design","unsupported_design"));
  if(frozen.baseline_mode!=="historical")issues.push(reason("HISTORICAL_BASELINE_REQUIRED","design","unsupported_design"));
  // Existing exposure reconciliation does not yet define terminal/early-end phase windows.
  if(input.analysisPolicyVersion===1&&(input.experiment.status!=="active"||input.experiment.phase!=="intervention"))issues.push(reason("UNSUPPORTED_LIFECYCLE_PHASE","design","unsupported_design"));
  let baselineWindow:ReturnType<typeof historicalWindow>|null=null,interventionWindow:ReturnType<typeof historicalWindow>|null=null;
  try {
    const zone=String(frozen.analysis_timezone),cutoff=new Date(input.cutoff);
    if(![frozen.baseline_start_date,frozen.baseline_end_date,frozen.intervention_start_date,frozen.intervention_end_date].every(isLogicalDate)||String(frozen.baseline_start_date)>String(frozen.baseline_end_date)||String(frozen.baseline_end_date)>=String(frozen.intervention_start_date)||String(frozen.intervention_start_date)>String(frozen.intervention_end_date))throw new Error("INVALID_BOUNDS");
    if(!lifecycle&&String(frozen.intervention_end_date)>=dateInZone(cutoff,zone)) {
      issues.push(reason("INTERVENTION_PERIOD_NOT_FINISHED","intervention","insufficient_data"));
      return {issues,family,method,outcome,definition,baselineWindow,interventionWindow,frozen,source,lifecycle};
    }
    baselineWindow=historicalWindow(zone,cutoff,String(frozen.baseline_start_date),shiftDate(String(frozen.baseline_end_date),1));
    interventionWindow=historicalWindow(zone,cutoff,String(frozen.intervention_start_date),lifecycle?.endDateExclusive??shiftDate(String(frozen.intervention_end_date),1));
    if(baselineWindow.endDateExclusive>interventionWindow.startDate)throw new Error("OVERLAP");
    if(interventionWindow.effectiveEndAtExclusive!==interventionWindow.endAtExclusive)issues.push(reason("INTERVENTION_PERIOD_NOT_FINISHED","intervention","insufficient_data"));
  }catch{issues.push(reason("INVALID_PHASE_BOUNDS_OR_TIMEZONE","design","blocked_by_integrity"));}
  return {issues,family,method,outcome,definition,baselineWindow,interventionWindow,frozen,source,lifecycle};
}
const unavailableQuality=():PeriodQuality=>({readCompleteness:"unavailable",expectedObservations:null,capturedObservations:null,eligibleObservations:null,missingObservations:null,cadence:"unsupported",observedDates:[],sourceMissingness:null,adapterVersion:null});
function periodData(source:SourceResult|null,scope:"baseline"|"intervention",plan:ReturnType<typeof inspectAnalysisPlan>,issues:AnalysisReason[]) {
  const empty={quality:unavailableQuality(),values:[] as number[],points:[] as {date:string;value:number}[]};
  if(!source){issues.push(reason("OBSERVATION_READ_UNAVAILABLE",scope,"unable_to_determine"));return empty;}
  const window=scope==="baseline"?plan.baselineWindow:plan.interventionWindow;
  if(!window||!plan.outcome||!plan.definition)return empty;
  if(source.target.kind!=="none"||source.grain!==plan.definition.grain){issues.push(reason("OBSERVATION_TARGET_OR_GRAIN_MISMATCH",scope,"blocked_by_integrity"));return empty;}
  if(source.contractVersion!==1||source.adapterVersion!==1||source.registryVersion!==plan.outcome.registry_version||source.registryKey!==plan.outcome.registry_key||source.unit!==plan.definition.unit||source.aggregation!==plan.outcome.aggregation_method||source.sourceDomain!==plan.definition.sourceAdapter||JSON.stringify(canonical(source.window))!==JSON.stringify(canonical(window))) {
    issues.push(reason("OBSERVATION_IDENTITY_VERSION_OR_CUTOFF_MISMATCH",scope,"blocked_by_integrity"));return empty;
  }
  if(source.queryCompleteness!=="complete") {issues.push(reason("INCOMPLETE_OBSERVATION_READ",scope,"unable_to_determine"));return {quality:{...empty.quality,readCompleteness:source.queryCompleteness,adapterVersion:source.adapterVersion,sourceMissingness:source.counts},values:[],points:[]};}
  if(!Array.isArray(source.observations)||source.observations.length>1000||source.observationCount!==source.observations.length||new Set(source.observations.map(o=>o.sourceId)).size!==source.observations.length||source.observations.some(o=>o.logicalDate<window.startDate||o.logicalDate>=window.endDateExclusive||!Number.isFinite(o.value.value))) {
    issues.push(reason("INVALID_OBSERVATION_EVIDENCE",scope,"blocked_by_integrity"));return empty;
  }
  if(plan.definition.grain==="day"&&new Set(source.observations.map(o=>o.logicalDate)).size!==source.observations.length){issues.push(reason("DUPLICATE_OBSERVATION_DAY",scope,"blocked_by_integrity"));return empty;}
  const readiness=evaluateReadiness(source);
  if(source.registryKey==="body_weight"&&source.counts.excluded>0)issues.push(reason("WEIGHT_PROVENANCE_EXCLUSIONS",scope,"unable_to_determine"));
  const days=source.nutritionDays??[];
  const invalidNutritionDays=new Set(days.map(d=>d.logicalDate)).size!==days.length||days.some(d=>d.logicalDate<window.startDate||d.logicalDate>=window.endDateExclusive)||source.observations.some(o=>!days.some(d=>d.logicalDate===o.logicalDate&&d.subtotal===o.value.value));
  if(source.sourceDomain==="nutrition"&&invalidNutritionDays){issues.push(reason("NUTRITION_DAY_EVIDENCE_MISMATCH",scope,"blocked_by_integrity"));return empty;}
  const completeDays=new Set(days.filter(d=>d.fieldComplete&&d.coverageStatus==="complete").map(d=>d.logicalDate));
  const population=scope==="intervention"&&plan.lifecycle?source.observations.filter(o=>plan.lifecycle!.activeDates.includes(o.logicalDate)):source.observations;
  const eligible=(source.sourceDomain==="nutrition"?population.filter(o=>completeDays.has(o.logicalDate)):population).toSorted((a,b)=>a.logicalDate.localeCompare(b.logicalDate));
  const points=eligible.map(o=>({date:o.logicalDate,value:o.value.value})),values=points.map(point=>point.value),dates=points.map(point=>point.date);
  const ordinalMaximum=plan.definition.unit==="ordinal_4"?4:10;
  if(plan.family==="repeated_ordinal"&&values.some(v=>!Number.isInteger(v)||v<1||v>ordinalMaximum)){issues.push(reason("INVALID_ORDINAL_VALUE",scope,"blocked_by_integrity"));return empty;}
  if(values.some(v=>v<0)){issues.push(reason("INVALID_RATIO_VALUE",scope,"blocked_by_integrity"));return empty;}
  const expected=scope==="intervention"&&plan.lifecycle?plan.lifecycle.activeDates.length:readiness.coverage.expectedDays;
  const quality:PeriodQuality={readCompleteness:"complete",expectedObservations:expected,capturedObservations:source.observations.length,eligibleObservations:values.length,missingObservations:expected===null?null:Math.max(0,expected-dates.length),cadence:expected===null?"unsupported":"daily",observedDates:dates,sourceMissingness:source.counts,adapterVersion:source.adapterVersion};
  if(expected===null)issues.push(reason("UNKNOWN_OUTCOME_DENOMINATOR",scope,"unsupported_design"));
  if(values.length<ANALYSIS_POLICY_V1.minimumObservationsPerPeriod)issues.push(reason(scope==="baseline"?"INSUFFICIENT_BASELINE_OBSERVATIONS":"INSUFFICIENT_INTERVENTION_OBSERVATIONS",scope,"insufficient_data"));
  return {quality,values,points};
}
export function summarizeContinuous(values:number[]):PeriodSummary {
  const sorted=[...values].sort((a,b)=>a-b),n=sorted.length;if(!n||sorted.some(v=>!Number.isFinite(v)))throw new Error("INVALID_VALUES");
  // Divide before adding to reduce avoidable sum overflow.
  const mean=sorted.reduce((sum,v)=>sum+v/n,0),median=sorted[Math.floor((n-1)/2)]/2+sorted[Math.floor(n/2)]/2;
  return {kind:"continuous",count:n,mean,median,minimum:sorted[0],maximum:sorted[n-1]};
}
export function summarizeOrdinal(values:number[]):PeriodSummary {
  const sorted=[...values].sort((a,b)=>a-b),n=sorted.length;if(!n||sorted.some(v=>!Number.isFinite(v)))throw new Error("INVALID_VALUES");
  const distribution=[...new Set(sorted)].map(value=>({value,count:sorted.filter(v=>v===value).length}));
  return {kind:"ordinal",count:n,medianLower:sorted[Math.floor((n-1)/2)],medianUpper:sorted[Math.floor(n/2)],distribution};
}
export function classifyDirection(movement:"higher"|"lower"|"unchanged"|"indeterminate",desirability:"higher"|"lower"|"unknown"):Direction {
  if(desirability==="unknown"||movement==="indeterminate")return "indeterminate";
  return movement==="unchanged"?"little_change":movement===desirability?"improved":"worsened";
}
function stateOf(issues:AnalysisReason[]):EligibilityState {
  return (["blocked_by_integrity","unsupported_design","unable_to_determine","insufficient_data"] as const).find(state=>issues.some(i=>i.state===state))??"ready";
}
export function analyzeCapturedInput(input:AnalysisInput,expectedDigest?:string):AnalysisResult {
  const digest=analysisDigest(input),plan=inspectAnalysisPlan(input),issues=[...input.acquisitionIssues,...plan.issues];
  const limitations=["DESCRIPTIVE_NONRANDOMIZED_COMPARISON","NO_CAUSAL_IDENTIFICATION","NO_SIGNIFICANCE_OR_UNCERTAINTY_INTERVALS","ALL_OBSERVED_INTERVENTION_DAYS_RETAINED","MINIMUM_SAMPLE_FLOOR_IS_NOT_POWER_OR_PRECISION",...input.integrityLimitations];
  if(plan.lifecycle){limitations.splice(limitations.indexOf("ALL_OBSERVED_INTERVENTION_DAYS_RETAINED"),1,"ALL_OBSERVED_ACTIVE_INTERVENTION_DAYS_RETAINED");limitations.push(...plan.lifecycle.limitations);}
  if(expectedDigest&&expectedDigest!==digest)issues.push(reason("CAPTURED_INPUT_DIGEST_MISMATCH","input","blocked_by_integrity"));
  let baseline={quality:unavailableQuality(),values:[] as number[],points:[] as {date:string;value:number}[]},intervention={quality:unavailableQuality(),values:[] as number[],points:[] as {date:string;value:number}[]};
  try {baseline=periodData(input.baseline,"baseline",plan,issues);intervention=periodData(input.intervention,"intervention",plan,issues);}catch{issues.push(reason("INVALID_CAPTURED_OBSERVATIONS","input","blocked_by_integrity"));}
  const exposure=input.exposure;
  if(!exposure)issues.push(reason("EXPOSURE_EVIDENCE_UNAVAILABLE","exposure","unable_to_determine"));
  else {
    const window=plan.interventionWindow;
    // The same nutrient can be read separately for outcome and exposure. Detect
    // contradictory snapshots without reimplementing frozen target evaluation.
    const target=supportedFrozenTarget(plan.source.definition);
    if(exposure.interventionType==="nutrition_target"&&target?.key===plan.outcome?.registry_key&&input.intervention?.queryCompleteness==="complete"&&exposure.evidenceCompleteness==="complete") {
      const days=input.intervention.nutritionDays??[];
      if(exposure.opportunities.some(o=>evaluateFrozenNutritionDay(plan.source.definition,days.find(d=>d.logicalDate===o.date),true).state!==o.state))issues.push(reason("EXPOSURE_OUTCOME_CAPTURE_CONFLICT","input","blocked_by_integrity"));
    }
    if(exposure.interventionType==="nutrition_target"&&exposure.denominator==="frozen_schedule"&&window&&exposure.eligibleOpportunityCount!==(plan.lifecycle?.activeDates.length??window.expectedDays))issues.push(reason("EXPOSURE_DAILY_DENOMINATOR_MISMATCH","exposure","blocked_by_integrity"));
    if(plan.lifecycle&&JSON.stringify(exposure.opportunities.map(o=>o.date).sort())!==JSON.stringify(plan.lifecycle.activeDates))issues.push(reason("EXPOSURE_ACTIVE_DATES_MISMATCH","exposure","blocked_by_integrity"));
    if(exposure.frozenRevision!==(Number.isSafeInteger(plan.source.revision)?Number(plan.source.revision):null)||new Set(exposure.opportunities.map(o=>o.date)).size!==exposure.opportunities.length||exposure.opportunities.some(o=>!window||o.date<window.startDate||o.date>=window.endDateExclusive||!["adherent","non-adherent","unknown"].includes(o.state)))issues.push(reason("EXPOSURE_OPPORTUNITY_OR_REVISION_MISMATCH","exposure","blocked_by_integrity"));
    if(exposure.contractVersion!==1||exposure.experimentRevision!==input.experiment.revision||exposure.frozenSourceId!==plan.source.id||exposure.interventionType!==object(plan.frozen.intervention).type||exposure.phase!==(plan.lifecycle?input.experiment.phase:"intervention")||exposure.evaluatedAt!==input.cutoff||exposure.window?.startDate!==window?.startDate||exposure.window?.endDateExclusive!==window?.endDateExclusive)issues.push(reason("EXPOSURE_IDENTITY_OR_CUTOFF_MISMATCH","exposure","blocked_by_integrity"));
    if(exposure.pauseState!=="clear")issues.push(reason("UNRESOLVED_PAUSE_HISTORY","exposure","blocked_by_integrity"));
    if(exposure.sourceIntegrity!=="frozen_definition_verified")issues.push(reason("EXPOSURE_HISTORICAL_INTEGRITY_UNVERIFIED","exposure","blocked_by_integrity"));
    if(exposure.denominator!=="frozen_schedule"||exposure.eligibleOpportunityCount===null)issues.push(reason("UNKNOWN_EXPOSURE_DENOMINATOR","exposure","unable_to_determine"));
    if(exposure.evidenceCompleteness==="unsupported")issues.push(reason("UNSUPPORTED_INTERVENTION_SOURCE","exposure","unable_to_determine"));
    if(exposure.evidenceCompleteness!=="complete"||exposure.unknownCount!==0||!exposure.eligibleOpportunityCount)issues.push(reason("INSUFFICIENT_EXPOSURE_EVIDENCE","exposure","insufficient_data"));
    if(exposure.eligibleOpportunityCount!==null&&(exposure.opportunities.length!==exposure.eligibleOpportunityCount||exposure.adherentCount!==exposure.opportunities.filter(o=>o.state==="adherent").length||exposure.nonAdherentCount!==exposure.opportunities.filter(o=>o.state==="non-adherent").length||exposure.unknownCount!==exposure.opportunities.filter(o=>o.state==="unknown").length))issues.push(reason("EXPOSURE_COUNTS_INCONSISTENT","exposure","blocked_by_integrity"));
  }
  let facts:AnalysisResult["facts"]=null;
  if(stateOf(issues)==="ready"&&plan.method) {
    const b=plan.family==="repeated_ordinal"?summarizeOrdinal(baseline.values):summarizeContinuous(baseline.values),i=plan.family==="repeated_ordinal"?summarizeOrdinal(intervention.values):summarizeContinuous(intervention.values);
    let absolute:number|null=null,relative:number|null=null,movement:NonNullable<AnalysisResult["facts"]>["neutralMovement"]="indeterminate";
    if(b.kind==="continuous"&&i.kind==="continuous") {absolute=i.mean-b.mean;relative=b.mean===0?null:absolute/Math.abs(b.mean)*100;movement=absolute===0?"unchanged":absolute>0?"higher":"lower";if(b.mean===0)limitations.push("RELATIVE_CHANGE_UNDEFINED_AT_ZERO_BASELINE");}
    else if(b.kind==="ordinal"&&i.kind==="ordinal") {movement=i.medianLower>b.medianUpper?"higher":i.medianUpper<b.medianLower?"lower":i.medianLower===b.medianLower&&i.medianUpper===b.medianUpper?"unchanged":"indeterminate";limitations.push("ORDINAL_RANKS_NOT_INTERVAL_SCALE","MEDIAN_INTERVAL_NOT_ARITHMETIC_RANK_AVERAGE");}
    const criterion=plan.outcome?.success_criterion,desirability=criterion?.kind==="change"?(criterion.direction==="increase"?"higher":"lower"):"unknown";
    if(desirability==="unknown")limitations.push("EXPECTED_DIRECTION_IS_NOT_DESIRABILITY");
    if(movement==="unchanged")limitations.push("EXACT_EQUALITY_NOT_CLINICAL_EQUIVALENCE");
    if([absolute,relative].some(v=>v!==null&&!Number.isFinite(v)))issues.push(reason("NONFINITE_DESCRIPTIVE_FACT","input","blocked_by_integrity"));
    else facts={baseline:b,intervention:i,absoluteChange:absolute,relativeChangePercent:relative,neutralMovement:movement,direction:classifyDirection(movement,desirability),directionSource:desirability==="unknown"?"unknown":"frozen_change_success_criterion",rateDifference:null,rateRatio:null,trend:null};
  }
  if((baseline.quality.missingObservations??0)>0||(intervention.quality.missingObservations??0)>0)limitations.push("MISSING_OBSERVATIONS_NOT_IMPUTED","COMPLETE_CASE_SUMMARIES_MAY_BE_SELECTIVELY_OBSERVED");
  const eligibility=stateOf(issues);
  const reliability=estimateReliability({family:plan.family,eligibility,unit:plan.definition?.unit??null,digest,baseline:baseline.points,intervention:intervention.points,baselineQuality:baseline.quality,interventionQuality:intervention.quality,endedEarly:input.experiment.status==="ended_early"});
  const finalLimitations=reliability.status==="supported"?limitations.filter(code=>code!=="NO_SIGNIFICANCE_OR_UNCERTAINTY_INTERVALS"):limitations;
  return {analysisContractVersion:input.analysisContractVersion,analysisPolicyVersion:input.analysisPolicyVersion,inputDigest:digest,eligibility:{state:eligibility,reasons:issues},family:plan.family,method:plan.method,exposureQuality:exposure,outcomeQuality:{baseline:baseline.quality,intervention:intervention.quality},facts,reliability,interpretationTier:facts?"descriptive":"indeterminate",limitations:[...new Set(finalLimitations)]};
}
export function captureAnalysisBundle(input:AnalysisInput):AnalysisBundle {
  const captured=structuredClone(input),inputDigest=analysisDigest(captured);
  return {input:captured,inputDigest,result:analyzeCapturedInput(captured,inputDigest)};
}
