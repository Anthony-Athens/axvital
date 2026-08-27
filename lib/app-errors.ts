export function friendlyErrorMessage(action: string) {
  return `We couldn't ${action} right now. Please try again.`;
}

export function logDevError(label: string, error: unknown) {
  if (process.env.NODE_ENV === "development") {
    void error;
    console.error("app.operation_failed", { operation: label, category: "operation_failed" });
  }
}

export function logDevInfo(label: string, payload: unknown) {
  if (process.env.NODE_ENV === "development") {
    void payload;
    console.info("app.operation", { operation: label });
  }
}
