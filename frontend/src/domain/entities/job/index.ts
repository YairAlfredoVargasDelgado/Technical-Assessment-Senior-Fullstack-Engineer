/**
 * Public API of the `job` entity.
 *
 * Everything outside `src/domain/entities/job` imports from here. Deep imports
 * into individual files are what turn an internal rename into a repository-wide
 * change, so the barrel is the contract.
 */
export type {
  CancelledJob,
  CompletedJob,
  DraftJob,
  InProgressJob,
  JobAction,
  JobActionOf,
  JobActionType,
  JobState,
  JobStateOf,
  JobStatus,
  ScheduledJob,
} from './job-state';

export {
  allowedActionsFor,
  canTransition,
  JOB_TRANSITIONS,
  nextStatusFor,
  transitionJob,
} from './job-state-machine';

export type { AllowedActionType, NextState } from './job-state-machine';

export { getJobSummary } from './job-summary';
