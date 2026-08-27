// In-memory only: no recovery credentials or grants are persisted separately.
// Supabase remains responsible for session validation and authorization.
export function recoveryTracker() {
  let userId: string | undefined;
  let deadline = 0;
  return {
    event(event: string, user: string | undefined, now = Date.now()) {
      if (event === "PASSWORD_RECOVERY" && user) {
        userId = user;
        deadline = now + 15 * 60 * 1000;
      } else if (event === "SIGNED_OUT" || (userId && user !== userId)) {
        userId = undefined;
        deadline = 0;
      }
    },
    valid(user: string | undefined, now = Date.now()) { return Boolean(user && user === userId && now < deadline); },
    clear() { userId = undefined; deadline = 0; },
  };
}

export const recovery = recoveryTracker();
