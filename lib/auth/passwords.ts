export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;
export const PASSWORD_HELP = "Use 8–72 characters.";
export const RESET_SENT = "If an AXVital account exists for that email address, we sent password reset instructions.";
export const INVALID_RECOVERY = "This password reset link is invalid or has expired.";

export function passwordError(password: string, confirmation?: string) {
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) return PASSWORD_HELP;
  if (confirmation !== undefined && password !== confirmation) return "Passwords do not match.";
  return "";
}

export function resetRedirectUrl(configuredUrl: string | undefined) {
  if (!configuredUrl) throw new Error("APP_URL_NOT_CONFIGURED");
  const url = new URL(configuredUrl);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
      (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))) {
    throw new Error("INVALID_APP_URL");
  }
  return `${url.origin}/reset-password`;
}

type AuthFailure = { code?: string; status?: number } | null;
export function resetRequestMessage(error: AuthFailure) {
  if (error?.status === 429 || error?.code === "over_email_send_rate_limit" || error?.code === "over_request_rate_limit") {
    return "Please wait a moment before requesting another reset email.";
  }
  // Account-specific errors must look exactly like a successful request.
  if (!error || ["user_not_found", "email_not_confirmed", "user_banned"].includes(error.code ?? "")) return RESET_SENT;
  return "We couldn't send a reset email right now. Please try again.";
}

export function passwordUpdateMessage(error: AuthFailure) {
  if (["reauthentication_needed", "reauthentication_not_valid", "session_not_found", "refresh_token_not_found"].includes(error?.code ?? "")) {
    return "Please sign in again before changing your password. If you used a reset link, request a new one.";
  }
  if (error?.code === "same_password") return "Choose a password different from your current password.";
  if (error?.code === "weak_password") return "Choose a stronger password. Use 8–72 characters and avoid common or compromised passwords.";
  return "We couldn't update your password. Please try again.";
}

type PasswordAuth = {
  getUser(): Promise<{ data: { user: { id: string } | null }; error: AuthFailure }>;
  updateUser(attributes: { password: string }): Promise<{ error: AuthFailure }>;
};

export async function updatePassword(auth: PasswordAuth, password: string, confirmation: string, recoveryAllowed?: (userId: string) => boolean) {
  const validation = passwordError(password, confirmation);
  if (validation) return validation;
  const { data, error } = await auth.getUser();
  if (error || !data.user || (recoveryAllowed && !recoveryAllowed(data.user.id))) {
    return recoveryAllowed ? INVALID_RECOVERY : "Please sign in again before changing your password.";
  }
  const result = await auth.updateUser({ password });
  return result.error ? passwordUpdateMessage(result.error) : "";
}

export async function requestPasswordReset(auth: { resetPasswordForEmail(email: string, options: { redirectTo: string }): Promise<{ error: AuthFailure }> }, email: string, appUrl: string | undefined) {
  try {
    const { error } = await auth.resetPasswordForEmail(email.trim(), { redirectTo: resetRedirectUrl(appUrl) });
    return resetRequestMessage(error);
  } catch { return resetRequestMessage({}); }
}

// A synchronous guard also covers clicks before React commits the disabled state.
export function submissionGuard() {
  let busy = false;
  return async (operation: () => Promise<void>) => {
    if (busy) return;
    busy = true;
    try { await operation(); } finally { busy = false; }
  };
}
