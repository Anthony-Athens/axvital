/** Deployment-owned public facts; never fabricate an operator or monitored mailbox. */
export function publicTrustDetails(environment: Record<string,string|undefined> = process.env) {
  const candidate=environment.AXVITAL_SUPPORT_EMAIL?.trim()??"";
  const supportEmail=/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(candidate)?candidate:null;
  const privacyCandidate=environment.AXVITAL_PRIVACY_EMAIL?.trim();
  const privacyEmail=privacyCandidate ? (/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(privacyCandidate)?privacyCandidate:null) : supportEmail;
  const operator=environment.AXVITAL_OPERATOR_NAME?.trim()||null;
  return {supportEmail,privacyEmail,operator,reviewed:Boolean(supportEmail&&privacyEmail&&operator&&environment.AXVITAL_LEGAL_REVIEWED==="true")};
}
