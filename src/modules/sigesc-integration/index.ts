export { getAggregateClient, resetAggregateClient, createAggregateClient } from "./client";
export { resolveAggregateMode, resolveAggregateHost, type AggregatePort } from "./port";
export {
  encryptAggregateKey,
  decryptAggregateKey,
  assertMcaKeyFormat,
  keyPrefixFromRaw,
} from "./crypto";
export { redactSecrets, safeErrorMessage, assertNoSecretLeak } from "./sanitize";
export {
  AggregateApiError,
  type AggregateOnboardingData,
  type AggregateCompany,
  type AggregateUser,
  type AggregateCustomer,
} from "./types";
export {
  MOCK_VALID_MCA_KEY,
  MOCK_REVOKED_MCA_KEY,
  MOCK_NOSCOPE_MCA_KEY,
  MOCK_AGGREGATE_FIXTURE,
  MOCK_PRODUCTS_FIXTURE,
  resetMockCustomerStore,
  resetMockProductStore,
  resetMockSaleStore,
  resetAllMockAggregateStores,
} from "./mock-adapter";
export {
  resolveInstitutionAggregateConnection,
  assertAggregateScope,
  mapAggregateError,
} from "./connection-context";

export {
  connectAggregateAccount,
  confirmOnboardingChallenge,
  fingerprintKeyForLog,
  validateOnboardingKey,
} from "./onboarding-service";
export type { ConfirmOnboardingResult, OnboardingPreview } from "./onboarding-service";
export {
  identifyAuthorizedAdministrator,
  isAggregateAdmin,
  toPublicAdminPreview,
  toPublicCompanyPreview,
} from "./admin-identification";
