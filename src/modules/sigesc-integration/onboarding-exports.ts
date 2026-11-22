export {
  connectAggregateAccount,
  confirmOnboardingChallenge,
  fingerprintKeyForLog,
  validateOnboardingKey,
} from "./onboarding-service";
export type { ConfirmOnboardingResult, OnboardingPreview } from "./onboarding-service";
export { AggregateApiError } from "./types";
export { assertNoSecretLeak } from "./sanitize";
