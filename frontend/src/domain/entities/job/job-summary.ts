import { assertNever } from '@/shared/lib/assert-never';

import type { JobState } from './job-state';

/**
 * Human-readable one-line summary of a job's current state.
 *
 * The `default` branch is the point of this function's shape: `assertNever`
 * accepts only `never`, so as long as every case is handled, `state` has been
 * narrowed away to nothing by the time control reaches it. Add a sixth member
 * to `JobState` and this file stops compiling — which is exactly when you want
 * to hear about it, rather than when a user sees "undefined" in the table.
 *
 * Each branch also demonstrates the payoff of the discriminated union: no
 * optional-chaining, no non-null assertions. `state.signatureUrl` is simply
 * present once `state.status === 'Completed'`.
 */
export function getJobSummary(state: JobState): string {
  switch (state.status) {
    case 'Draft':
      return state.notes === undefined ? 'Draft — no notes yet' : `Draft — ${state.notes}`;

    case 'Scheduled':
      return `Scheduled for ${formatDate(state.scheduledDate)}, assigned to ${state.assigneeId}`;

    case 'InProgress':
      return `In progress since ${formatDate(state.startedAt)} — ${describePhotos(state.photos.length)}`;

    case 'Completed':
      return `Completed ${formatDate(state.completedAt)} — ${describePhotos(state.photos.length)}, signed off`;

    case 'Cancelled':
      return `Cancelled ${formatDate(state.cancelledAt)} — ${state.reason}`;

    default:
      return assertNever(state, 'JobState');
  }
}

/**
 * Stable, locale-independent formatting.
 *
 * `toLocaleDateString()` would render differently depending on the machine's
 * locale, which makes assertions in tests and snapshots environment-dependent.
 */
function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function describePhotos(count: number): string {
  return count === 1 ? '1 photo' : `${count} photos`;
}
