import type { JobStatus } from '@/domain/entities/job';

const MODIFIER: Readonly<Record<JobStatus, string>> = {
  Draft: '',
  Scheduled: '',
  InProgress: ' badge--in-progress',
  Completed: ' badge--completed',
  Cancelled: ' badge--cancelled',
};

const LABEL: Readonly<Record<JobStatus, string>> = {
  Draft: 'Draft',
  Scheduled: 'Scheduled',
  InProgress: 'In progress',
  Completed: 'Completed',
  Cancelled: 'Cancelled',
};

/**
 * Renders a job's status.
 *
 * A Server Component — no `'use client'`. It has no interactivity and no state,
 * so shipping its code to the browser would be pure cost. Keeping leaf components
 * server-side wherever possible is what makes the `'use client'` boundary
 * meaningful rather than a formality applied to the whole tree.
 *
 * The maps are exhaustive `Record<JobStatus, …>` rather than a `switch` with a
 * fallback: adding a status to the union makes this file stop compiling, which is
 * when you want to hear about it.
 */
export function StatusBadge({ status }: { readonly status: JobStatus }) {
  return (
    <span className={`badge${MODIFIER[status]}`} data-testid={`job-status-${status}`}>
      {LABEL[status]}
    </span>
  );
}
