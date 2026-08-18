'use client';

import { StatusBadge } from '@/presentation/components/atoms/status-badge.component';
import { Button } from '@/presentation/components/atoms/button.component';
import type { Job } from '@/domain/entities/job/job.entity';
import type { JobSortField } from '@/domain/entities/job/job.entity';
import { selectSortConfig, useJobsStore } from '@/presentation/stores/jobs.store';
import { useIsJobPending } from '@/presentation/stores/use-visible-jobs.hook';

import type { UseJobsPageResult } from '../../hooks/use-jobs-page.hook';

interface JobsTableProps {
  readonly page: UseJobsPageResult;
}

const COLUMNS: readonly { readonly field: JobSortField; readonly label: string }[] = [
  { field: 'title', label: 'Title' },
  { field: 'status', label: 'Status' },
  { field: 'scheduledDateUtc', label: 'Scheduled' },
  { field: 'updatedAtUtc', label: 'Updated' },
];

/**
 * The job list.
 *
 * A thin shell: no state and no handler bodies. `page` carries the rows, the
 * selection, the totals and the per-row action list; this file decides only what
 * that looks like.
 *
 * The action buttons deserve a note. Which of them render is not decided here —
 * `page.availableActions(job)` asks the state machine, and the machine reports
 * nothing for a terminal job. So there is no `job.status === 'Completed'` check
 * anywhere in this file, and adding a status to the lifecycle needs no edit to it.
 */
export function JobsTable({ page }: JobsTableProps) {
  const sortConfig = useJobsStore(selectSortConfig);
  const toggleSort = useJobsStore((state) => state.toggleSort);

  if (page.jobs.length === 0) {
    return (
      <div className="card empty-state" data-testid="jobs-empty-state">
        <p style={{ margin: 0 }}>No jobs match the current filters.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="summary" data-testid="jobs-summary">
        <span data-testid="jobs-total">{page.totals.total} shown</span>
        <span>{page.totals.scheduled} scheduled</span>
        <span>{page.totals.inProgress} in progress</span>
        <span>{page.totals.completed} completed</span>

        {page.totals.pendingCount > 0 ? (
          <span data-testid="jobs-pending-count">{page.totals.pendingCount} saving…</span>
        ) : null}
      </div>

      <div className="table-wrapper">
        <table className="table" data-testid="jobs-table">
          <caption className="visually-hidden">
            Jobs for your organization, sorted by {sortConfig.field}, {sortConfig.direction}ending.
          </caption>

          <thead>
            <tr>
              <th scope="col">
                <span className="visually-hidden">Select</span>
              </th>

              {COLUMNS.map((column) => (
                <th
                  key={column.field}
                  scope="col"
                  // Communicates the sort to assistive technology. Without it a
                  // screen-reader user cannot tell which column is sorted, or
                  // which way.
                  aria-sort={
                    sortConfig.field === column.field
                      ? sortConfig.direction === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                >
                  <button
                    type="button"
                    className="table__sort-button"
                    onClick={() => toggleSort(column.field)}
                    data-testid={`jobs-sort-${column.field}`}
                  >
                    {column.label}
                    <span aria-hidden="true">
                      {sortConfig.field === column.field ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '↕'}
                    </span>
                  </button>
                </th>
              ))}

              <th scope="col">Photos</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>

          <tbody>
            {page.jobs.map((job) => (
              <JobRow key={job.id} job={job} page={page} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function JobRow({ job, page }: { readonly job: Job; readonly page: UseJobsPageResult }) {
  const actions = page.availableActions(job);

  // Whether a change is in flight for THIS row — read from the optimistic
  // overlay, not from whether a modal happens to be open. The two are different
  // questions, and using the modal meant a job being started never showed as
  // pending while a job merely being looked at did.
  const isPending = useIsJobPending(job.id);

  return (
    <tr data-testid={`job-row-${job.id}`} data-pending={isPending}>
      <td>
        <input
          type="checkbox"
          checked={page.isSelected(job.id)}
          onChange={() => page.toggleSelection(job.id)}
          aria-label={`Select ${job.title}`}
          data-testid={`job-select-${job.id}`}
        />
      </td>

      <td data-testid={`job-title-${job.id}`}>
        <div>{job.title}</div>
        <div className="field__hint">
          {job.address.street}, {job.address.city}
        </div>
      </td>

      <td>
        <StatusBadge status={job.status} />
      </td>

      <td>{job.scheduledDateUtc === null ? '—' : formatDate(job.scheduledDateUtc)}</td>

      <td>{formatDate(job.updatedAtUtc)}</td>

      <td>{job.photoCount}</td>

      <td>
        <div className="toolbar">
          {actions.includes('start') ? (
            <Button onClick={() => void page.completion.start(job)} data-testid={`job-start-${job.id}`}>
              Start
            </Button>
          ) : null}

          {actions.includes('complete') ? (
            <Button
              variant="primary"
              onClick={() => page.completion.open(job)}
              data-testid={`job-complete-${job.id}`}
            >
              Complete
            </Button>
          ) : null}

          {actions.length === 0 ? <span className="field__hint">No actions</span> : null}
        </div>
      </td>
    </tr>
  );
}

/**
 * Renders an ISO timestamp.
 *
 * Fixed locale and time zone rather than `toLocaleString()` with defaults: the
 * server and the browser would otherwise render the same instant differently,
 * producing a hydration mismatch — and every assertion in the E2E suite would
 * depend on the machine's locale.
 */
function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(iso));
}
