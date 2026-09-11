// Browser funnel observation only; the profile webhook remains the authoritative total.
// Reject obfuscated existing-user replies and accounts predating this attempt.
export function newlyCreatedSignup(user: { created_at?: string; identities?: unknown[] } | null, startedAt: number, finishedAt: number) {
  if (!user?.identities?.length || !user.created_at) return false;
  const created = Date.parse(user.created_at);
  return Number.isFinite(created) && created >= startedAt && created <= finishedAt;
}
