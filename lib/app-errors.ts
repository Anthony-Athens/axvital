export function friendlyErrorMessage(action: string) {
  return `We couldn't ${action} right now. Please try again.`;
}

export function logDevError(label: string, error: unknown) {
  if (process.env.NODE_ENV === "development") {
    console.error(label, error);
  }
}

export function logDevInfo(label: string, payload: unknown) {
  if (process.env.NODE_ENV === "development") {
    console.log(label, payload);
  }
}
