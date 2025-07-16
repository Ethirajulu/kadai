export type {
  VerificationReport,
  VerificationConfig,
  VerificationMetrics,
  CustomValidator,
} from './cleanup-verifier';

export { CleanupVerifier } from './cleanup-verifier';

export type {
  ReportFormat,
  ReportOptions,
  ConsoleReportOptions,
} from './verification-reporter';

export { 
  VerificationReporter,
  generateVerificationReport,
} from './verification-reporter';

// Re-export verification-related types from cleanup types
export type {
  CleanupVerificationResult,
  CleanupIssue,
} from '../../types/cleanup';