import type { SourceResult } from "../measurements/observations.ts";
import type { ExposureEvidence } from "./exposure-evidence.ts";
import type {LifecycleEvidence} from "./lifecycle.ts";
import type {ReliabilityResult} from "./reliability.ts";

export type AnalysisFamily="repeated_continuous"|"repeated_ordinal"|"count_frequency"|"binary_repeated"|"pre_post_performance"|"unsupported";
export type EligibilityState="ready"|"insufficient_data"|"unsupported_design"|"blocked_by_integrity"|"unable_to_determine";
export type AnalysisReason={code:string;scope:"input"|"design"|"exposure"|"baseline"|"intervention";state:Exclude<EligibilityState,"ready">};
/** Private server/developer artifact. Contains source records; not an HTTP DTO.
 * Retain this entire captured bundle for replay. A cutoff alone is not an as-of database snapshot.
 */
export type AnalysisInput={
  analysisContractVersion:1|2;analysisPolicyVersion:1|2;readinessPolicyVersion:1;
  lifecycle?:LifecycleEvidence;durableCapture?:{revision:number;digest:string;captureVersion:1};
  experiment:{id:string;revision:number;modelVersion:number;status:string;phase:string};
  startSnapshot:{snapshot_version:number;config_revision:number;configuration:Record<string,unknown>}|null;
  cutoff:string;reproducibility:"captured_inputs_only";
  baseline:SourceResult|null;intervention:SourceResult|null;exposure:ExposureEvidence|null;
  acquisitionIssues:AnalysisReason[];
  integrityLimitations:string[];
};
export type PeriodQuality={
  readCompleteness:"complete"|"failed"|"truncated"|"unavailable";
  expectedObservations:number|null;capturedObservations:number|null;eligibleObservations:number|null;missingObservations:number|null;
  cadence:"daily"|"unsupported";observedDates:string[];
  sourceMissingness:SourceResult["counts"]|null;adapterVersion:number|null;
};
export type PeriodSummary=
  | {kind:"continuous";count:number;mean:number;median:number;minimum:number;maximum:number}
  | {kind:"ordinal";count:number;medianLower:number;medianUpper:number;distribution:{value:number;count:number}[]};
export type Direction="improved"|"worsened"|"little_change"|"indeterminate";
export type AnalysisResult={
  analysisContractVersion:1|2;analysisPolicyVersion:1|2;inputDigest:string;
  eligibility:{state:EligibilityState;reasons:AnalysisReason[]};family:AnalysisFamily;method:string|null;
  exposureQuality:ExposureEvidence|null;outcomeQuality:{baseline:PeriodQuality;intervention:PeriodQuality};
  facts:{baseline:PeriodSummary;intervention:PeriodSummary;absoluteChange:number|null;relativeChangePercent:number|null;neutralMovement:"higher"|"lower"|"unchanged"|"indeterminate";direction:Direction;directionSource:"frozen_change_success_criterion"|"unknown";rateDifference:null;rateRatio:null;trend:null}|null;
  interpretationTier:"descriptive"|"indeterminate";limitations:string[];
  reliability:ReliabilityResult;
};
export type AnalysisBundle={input:AnalysisInput;inputDigest:string;result:AnalysisResult};
