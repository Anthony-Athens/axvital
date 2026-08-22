import type { ExposureCategory, ExposureDay } from "../trigger-analysis/types.ts";

export const EPISODE_SIMILARITY_VERSION = "episode-similarity-v1";
export const OUTLOOK_HOURS = 72 as const;
export const MIN_VECTOR_COMPLETENESS = .5;
export const MIN_SHARED_COVERAGE = .5;
export const CONTROL_SPACING_HOURS = 72;
export const MAX_CONTROLS_PER_POSITIVE = 5;
export const PERFORMANCE_MIN_POSITIVES = 5;
export const PERFORMANCE_MIN_WINDOWS = 20;

export type ReadinessLevel = "not_ready"|"experimental"|"exploratory"|"established_history";
export type OutlookClassification = "unavailable"|"low_similarity"|"typical"|"elevated_similarity"|"high_similarity";
export type FeatureKey = "sleep_quality"|"energy"|"mood"|"calories"|"protein"|"caffeine"|"alcohol"|"workout_minutes"|"workout_volume"|"habit_adherence"|"protocol_adherence"|"precursor_symptoms";
export type FeatureVector = { windowStartAt:string; windowEndAt:string; values:Partial<Record<FeatureKey,number|null>>; featureCompleteness:number };
export type FeatureDefinition = { key:FeatureKey; label:string; category:ExposureCategory; unit:string|null; normalization:"zscore"|"binary"; value:(days:ExposureDay[])=>number|null };
export type HistoricalVector = { kind:"positive"|"negative"; episodeId:string|null; vector:FeatureVector };
export type OutlookFactor = { key:FeatureKey; label:string; category:ExposureCategory; currentValue:number; baselineValue:number|null; positiveMean:number; negativeMean:number; summary:string };
export type NearestEpisodeMatch = { episodeId:string; onsetAt:string; similarity:number; label:"High similarity"|"Moderate similarity"|"Some similarity" };
export type Readiness = { level:ReadinessLevel; totalEpisodes:number; usablePositiveWindows:number; negativeWindows:number; featureCompleteness:number; usableFeatures:number; historyDays:number };
export type BacktestMetrics = { evaluatedWindows:number; positiveOutcomes:number; truePositives:number; falsePositives:number; trueNegatives:number; falseNegatives:number; sensitivity:number|null; specificity:number|null; precision:number|null; recall:number|null; falsePositiveRate:number|null; falseNegativeRate:number|null; displayable:boolean };
export type ConditionOutlook = { userConditionId:string; conditionLabel:string; episodeLabel:string; generatedAt:string; predictionHorizonHours:72; analysisVersion:string; readiness:Readiness; classification:OutlookClassification; positiveSimilarity:number|null; negativeSimilarity:number|null; similarityDelta:number|null; featureCoverage:number; positiveWindowsUsed:number; negativeWindowsUsed:number; contributingFactors:OutlookFactor[]; nearestEpisodes:NearestEpisodeMatch[]; limitations:string[]; performance:BacktestMetrics|null };
export type OutlookInput = { userConditionId:string; conditionLabel:string; episodeLabel:string; predictionAt:string; episodes:Array<{id:string;started_at:string;ended_at?:string|null}>; days:ExposureDay[] };
