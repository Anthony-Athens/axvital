export type WeightProvenance="explicit_unit_verified"|"source_contract_verified"|"legacy_unit_verified"|"legacy_unit_ambiguous"|"invalid_value"|"unsupported_source";
export const KG_PER_LB=0.45359237;
export type WeightRecord={weight?:unknown;weight_source_value?:unknown;weight_source_unit?:unknown;weight_provenance_version?:unknown;weight_kg?:unknown};
/** v1: only explicit persisted source units qualify. No historical source rule
 * is proven; the other verified classifications are reserved, never inferred.
 */
export function normalizeBodyWeight(row:WeightRecord,source="daily_checkins"):{value:number|null;unit:"kg";provenance:WeightProvenance;version:1}{
 const result=(provenance:WeightProvenance,value:number|null=null)=>({value,unit:"kg" as const,provenance,version:1 as const});
 if(source!=="daily_checkins")return result("unsupported_source");
 if(row.weight_source_value==null&&row.weight_source_unit==null&&row.weight_provenance_version==null)return result("legacy_unit_ambiguous");
 if(row.weight_provenance_version!==1||!["kg","lb"].includes(String(row.weight_source_unit)))return result("unsupported_source");
 const raw=row.weight_source_value;if(typeof raw!=="number"||!Number.isFinite(raw)||raw<=0)return result("invalid_value");
 const value=row.weight_source_unit==="lb"?raw*KG_PER_LB:raw;
 if(!Number.isFinite(value)||value<=0||typeof row.weight_kg!=="number"||!Number.isFinite(row.weight_kg)||Math.abs(row.weight_kg-value)>Math.max(1e-9,Math.abs(value)*1e-12))return result("invalid_value");
 return result("explicit_unit_verified",value);
}
