import { exposureDefinitions } from "../trigger-analysis/exposures.ts";
import type { ExposureDay } from "../trigger-analysis/types.ts";
import { OUTLOOK_HOURS, type FeatureDefinition, type FeatureKey, type FeatureVector } from "./types.ts";

const allowed = new Set<FeatureKey>(["sleep_quality","energy","mood","calories","protein","caffeine","alcohol","workout_minutes","workout_volume","habit_adherence","protocol_adherence","precursor_symptoms"]);
export const featureRegistry:FeatureDefinition[] = exposureDefinitions.filter(x=>allowed.has(x.key as FeatureKey)).map(x=>({key:x.key as FeatureKey,label:x.label,category:x.category,unit:x.unit,normalization:x.dataType==="binary"?"binary":"zscore",value:x.value}));

export function generateFeatureVector(days:ExposureDay[],endAt:string):FeatureVector{
 const end=new Date(endAt);if(Number.isNaN(end.valueOf()))throw new Error("Invalid prediction timestamp");
 const start=new Date(end.getTime()-OUTLOOK_HOURS*3600000),eligible=days.filter(x=>{const at=new Date(x.at).getTime();return at>=start.getTime()&&at<end.getTime()});
 const values={} as FeatureVector["values"];for(const feature of featureRegistry)values[feature.key]=feature.value(eligible);
 const present=featureRegistry.filter(x=>values[x.key]!=null).length;
 return{windowStartAt:start.toISOString(),windowEndAt:end.toISOString(),values,featureCompleteness:present/featureRegistry.length};
}
