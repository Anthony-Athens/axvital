export type GettingStartedProgress = {
  checkin: boolean;
  logged: boolean;
  setup: boolean;
  dashboard: boolean;
  experiments: boolean;
};

export function completedGettingStartedSteps(progress: GettingStartedProgress) {
  return Object.values(progress).filter(Boolean).length;
}

export function shouldShowGettingStarted(progress: GettingStartedProgress, dismissed: boolean) {
  return !dismissed && completedGettingStartedSteps(progress) < 4;
}
