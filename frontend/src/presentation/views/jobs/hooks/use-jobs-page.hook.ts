'use client';

import { useCallback, useState } from 'react';

import type { Job } from '@/domain/entities/job/job.entity';
import { allowedActionsFor } from '@/domain/entities/job';
import type { JobActionType } from '@/domain/entities/job';
import {
  selectSelectedJobIds,
  useJobsStore,
} from '@/presentation/stores/jobs.store';
import { useJobTotals, useVisibleJobs } from '@/presentation/stores/use-visible-jobs.hook';

import { useCreateJob } from '../features/create-job';
import type { UseCreateJobResult } from '../features/create-job';
import { useFilterJobs } from '../features/filter-jobs';
import type { UseFilterJobsResult } from '../features/filter-jobs';
import { useCompleteJob } from '../features/complete-job';
import type { UseCompleteJobResult } from '../features/complete-job';

/**
 * Orchestrates the jobs view.
 *
 * ## Why the slices are composed here and nowhere else
 *
 * `create-job`, `filter-jobs` and `complete-job` do not import each other. Not
 * once — and that is the property that makes them slices rather than folders. A
 * slice that imported another would be coupled to its internals and could not be
 * moved, deleted or replaced without touching the other.
 *
 * This hook is the only place that knows all three exist, and it composes them
 * through their public barrels. Coupling is concentrated in one file instead of
 * being spread across the feature tree.
 *
 * ## What it adds beyond composition
 *
 * The cross-slice concerns that belong to no single slice: which actions a given
 * row permits (the state machine), the totals across the visible rows, and the
 * selection. Putting "can this job be completed?" inside `complete-job` would
 * mean the table had to import that slice to render a row.
 */
export interface UseJobsPageResult {
  readonly jobs: readonly Job[];
  readonly totals: ReturnType<typeof useJobTotals>;
  readonly selectedJobIds: readonly string[];
  readonly isSelected: (jobId: string) => boolean;
  readonly toggleSelection: (jobId: string) => void;
  readonly clearSelection: () => void;

  readonly filters: UseFilterJobsResult;
  readonly creation: UseCreateJobResult;
  readonly completion: UseCompleteJobResult;

  readonly isCreateModalOpen: boolean;
  readonly openCreateModal: () => void;
  readonly closeCreateModal: () => void;

  /** Which lifecycle actions the row's current status permits. */
  readonly availableActions: (job: Job) => readonly JobActionType[];
}

export function useJobsPage(serverJobs: readonly Job[]): UseJobsPageResult {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Derived by selector during render — never by useEffect + setState.
  const jobs = useVisibleJobs(serverJobs);
  const totals = useJobTotals(jobs);

  const selectedJobIds = useJobsStore(selectSelectedJobIds);
  const toggleSelection = useJobsStore((state) => state.toggleSelection);
  const clearSelection = useJobsStore((state) => state.clearSelection);

  const filters = useFilterJobs();
  const completion = useCompleteJob();

  const closeCreateModal = useCallback(() => {
    setIsCreateModalOpen(false);
  }, []);

  // Closing on success is the create slice's business, but *where* the modal's
  // open flag lives is this hook's. Passing the callback in keeps the slice
  // unaware of the modal that hosts it.
  const creation = useCreateJob(closeCreateModal);

  const openCreateModal = useCallback(() => {
    setIsCreateModalOpen(true);
  }, []);

  const isSelected = useCallback(
    (jobId: string) => selectedJobIds.includes(jobId),
    [selectedJobIds],
  );

  /**
   * The state machine from Part 1, driving the UI.
   *
   * The buttons a row shows come from the same `JOB_TRANSITIONS` table that types
   * `transitionJob` and that guards `TransitionJobUseCase`. So a row that is
   * Completed renders no action buttons at all — not because the table has a
   * special case for it, but because the machine reports no legal actions.
   */
  const availableActions = useCallback((job: Job) => allowedActionsFor(job.status), []);

  return {
    jobs,
    totals,
    selectedJobIds,
    isSelected,
    toggleSelection,
    clearSelection,
    filters,
    creation,
    completion,
    isCreateModalOpen,
    openCreateModal,
    closeCreateModal,
    availableActions,
  };
}
