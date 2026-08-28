import type { ClassificationKey } from "../rules/types.ts";
export type EvidenceState = "present" | "absent" | "unknown";
export type ClassificationEvidence = { classification_key: ClassificationKey; state: EvidenceState; definition_version: 1; provenance: string };
export type IntakeCoverage = "complete" | "partial" | "unknown";
/** Evidence lookup only, never an adherence evaluation. Categories are deliberately not an input. */
export function classificationState(evidence: readonly ClassificationEvidence[], key: ClassificationKey): EvidenceState {
  const matches = evidence.filter(item => item.classification_key === key);
  if (matches.length !== 1) return "unknown";
  return matches[0].state;
}
export function coverageState(record: { coverage_status: IntakeCoverage } | null): IntakeCoverage { return record?.coverage_status ?? "unknown"; }
