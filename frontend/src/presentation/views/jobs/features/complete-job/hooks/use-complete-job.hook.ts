'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';

import { completeJobAction, startJobAction } from '@app/jobs/actions';
import { nextStatusFor } from '@/domain/entities/job';
import type { JobActionType } from '@/domain/entities/job';
import type { Job } from '@/domain/entities/job/job.entity';
import type { AppError } from '@/domain/errors';
import { useJobsStore } from '@/presentation/stores/jobs.store';

export interface UseCompleteJobResult {
  /** The job the dialog is open for, or `null` when it is closed. */
  readonly target: Job | null;
  readonly signatureUrl: string;
  readonly isSubmitting: boolean;
  readonly error: AppError | null;
  readonly open: (job: Job) => void;
  readonly close: () => void;
  readonly setSignatureUrl: (signatureUrl: string) => void;
  readonly confirm: () => Promise<void>;
  /** Moves a scheduled job to in-progress. Optimistic, with rollback. */
  readonly start: (job: Job) => Promise<void>;
}

/**
 * Completing and starting a job, with optimistic updates.
 *
 * ## The optimistic update, and what makes rollback trivial
 *
 * The sequence is always the same:
 *
 * 1. `applyOptimisticStatus(id, next)` — the overlay now says this job is in the
 *    new state, so the table re-renders immediately.
 * 2. Call the Server Action.
 * 3. On failure, `rollbackOptimisticStatus(id)` — the patch is deleted and the
 *    row reverts to whatever the server said. On success,
 *    `router.refresh()` then `settleOptimisticStatus(id)`.
 *
 * Rollback is a key deletion because the store never mutated the row. Had the
 * store held a copy of the job list and mutated it in place, rollback would need
 * a snapshot taken before the change, kept somewhere, and correctly discarded on
 * every exit path — three more things to get wrong, and the reason optimistic
 * updates are usually buggy.
 *
 * ## Why settle happens after refresh, not before
 *
 * Dropping the patch first would show the *old* status for the moment between the
 * drop and the refreshed data arriving — a visible flicker backwards. Refreshing
 * first means the server row already carries the new status when the overlay is
 * removed, so the transition is invisible.
 */
export function useCompleteJob(): UseCompleteJobResult {
  const [target, setTarget] = useState<Job | null>(null);
  const [signatureUrl, setSignatureUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  const router = useRouter();
  const applyOptimisticStatus = useJobsStore((state) => state.applyOptimisticStatus);
  const rollbackOptimisticStatus = useJobsStore((state) => state.rollbackOptimisticStatus);
  const settleOptimisticStatus = useJobsStore((state) => state.settleOptimisticStatus);

  const open = useCallback((job: Job) => {
    setTarget(job);
    setSignatureUrl('');
    setError(null);
  }, []);

  const close = useCallback(() => {
    setTarget(null);
    setError(null);
  }, []);

  const start = useCallback(
    async (job: Job) => {
      // The target status comes from the transition table, never from a literal
      // here. Writing 'InProgress' would be a second place encoding "start leads
      // to InProgress", and it would silently disagree with the machine the first
      // time that changed.
      const optimisticStatus = nextStatusFor(job.status, 'start');

      if (optimisticStatus === null) {
        setError(illegalTransition(job.status, 'start'));
        return;
      }

      applyOptimisticStatus(job.id, optimisticStatus);

      const result = await startJobAction(job.id, job.status);

      if (!result.ok) {
        rollbackOptimisticStatus(job.id);
        setError(result.error);
        return;
      }

      router.refresh();
      settleOptimisticStatus(job.id);
    },
    [applyOptimisticStatus, rollbackOptimisticStatus, settleOptimisticStatus, router],
  );

  const confirm = useCallback(async () => {
    if (target === null || signatureUrl.trim().length === 0 || isSubmitting) {
      return;
    }

    const optimisticStatus = nextStatusFor(target.status, 'complete');

    if (optimisticStatus === null) {
      setError(illegalTransition(target.status, 'complete'));
      return;
    }

    setIsSubmitting(true);
    setError(null);
    applyOptimisticStatus(target.id, optimisticStatus);

    const result = await completeJobAction(target.id, signatureUrl.trim(), target.status);

    setIsSubmitting(false);

    if (!result.ok) {
      rollbackOptimisticStatus(target.id);
      setError(result.error);
      return;
    }

    router.refresh();
    settleOptimisticStatus(target.id);
    setTarget(null);
  }, [
    target,
    signatureUrl,
    isSubmitting,
    applyOptimisticStatus,
    rollbackOptimisticStatus,
    settleOptimisticStatus,
    router,
  ]);

  return {
    target,
    signatureUrl,
    isSubmitting,
    error,
    open,
    close,
    setSignatureUrl,
    confirm,
    start,
  };
}

/**
 * The message shown when the machine refuses a transition before any request is
 * made. Uses the backend's own error code so the UI has one branch to handle
 * regardless of which side rejected it.
 */
function illegalTransition(status: string, action: JobActionType): AppError {
  return {
    code: 'Job.InvalidTransition',
    message: `A job in state "${status}" cannot be ${action === 'start' ? 'started' : 'completed'}.`,
  };
}
