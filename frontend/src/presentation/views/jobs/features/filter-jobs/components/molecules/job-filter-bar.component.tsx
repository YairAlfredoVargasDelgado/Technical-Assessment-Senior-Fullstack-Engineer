'use client';

import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';

import { Button } from '@/presentation/components/atoms/button.component';
import { ToggleButton } from '@/presentation/components/atoms/toggle-button.component';
import { TextField } from '@/presentation/components/molecules/text-field.component';

import { FILTERABLE_STATUSES } from '../../hooks/use-filter-jobs.hook';
import type { UseFilterJobsResult } from '../../hooks/use-filter-jobs.hook';

/**
 * The filter bar — a **Compound Component**.
 *
 * ```tsx
 * <FilterBar filters={filters}>
 *   <FilterBar.Search />
 *   <FilterBar.Status />
 *   <FilterBar.DateRange />
 *   <FilterBar.Reset />
 * </FilterBar>
 * ```
 *
 * ## What the pattern buys here
 *
 * The caller composes the bar — chooses which controls appear, in what order,
 * with what wrapping — without any of them needing to be passed the filter state.
 * A props-based alternative (`<FilterBar showStatus showDateRange … />`) grows a
 * boolean per control and can never express "status, then a custom control, then
 * dates".
 *
 * ## Compound AND controlled, not one or the other
 *
 * The context carries no state of its own. It carries the `UseFilterJobsResult`
 * the *parent* owns, which the parent got from the store. So each sub-component
 * reads its value and calls back — the Controlled Component pattern — while the
 * context solves the plumbing that would otherwise require every sub-component to
 * be handed the same six props.
 *
 * ## Why the context is private
 *
 * `FilterBarContext` is not exported. A sub-component used outside the parent
 * gets a clear runtime error from `useFilterBar` instead of silently rendering
 * with undefined handlers — and no external code can inject a different context
 * value and bypass the parent.
 */
const FilterBarContext = createContext<UseFilterJobsResult | null>(null);

function useFilterBar(): UseFilterJobsResult {
  const context = useContext(FilterBarContext);

  if (context === null) {
    throw new Error('FilterBar sub-components must be rendered inside <FilterBar>.');
  }

  return context;
}

interface FilterBarProps {
  readonly filters: UseFilterJobsResult;
  readonly children: ReactNode;
}

function FilterBarRoot({ filters, children }: FilterBarProps) {
  // `filters` is already a stable object from the hook, but memoising the context
  // value keeps that guarantee local: if the hook's shape ever changes, consumers
  // do not start re-rendering on every parent render as a side effect.
  const value = useMemo(() => filters, [filters]);

  return (
    <FilterBarContext.Provider value={value}>
      <section className="filter-bar" aria-label="Job filters" data-testid="job-filter-bar">
        {children}
      </section>
    </FilterBarContext.Provider>
  );
}

function FilterBarSearch() {
  const { filters, setSearchTerm } = useFilterBar();

  return (
    <div className="filter-bar__group" style={{ minWidth: 260 }}>
      <TextField
        label="Search"
        type="search"
        value={filters.searchTerm}
        onValueChange={setSearchTerm}
        placeholder="Title or description"
        testId="filter-search"
      />
    </div>
  );
}

function FilterBarStatus() {
  const { toggleStatus, isStatusActive, activeStatusCount } = useFilterBar();

  return (
    <fieldset className="filter-bar__group" style={{ border: 0, margin: 0, padding: 0 }}>
      <legend className="filter-bar__legend">
        Status
        {/*
          The count is announced to screen readers but not shown, so a keyboard
          user knows how many filters are active without having to tab through
          all five buttons to find out.
        */}
        <span className="visually-hidden">
          {activeStatusCount === 0 ? ' — no filters applied' : ` — ${activeStatusCount} applied`}
        </span>
      </legend>

      <div className="filter-bar__options" role="group" aria-label="Filter by status">
        {FILTERABLE_STATUSES.map((status) => (
          <ToggleButton
            key={status}
            pressed={isStatusActive(status)}
            onToggle={() => toggleStatus(status)}
            testId={`filter-status-${status}`}
          >
            {status === 'InProgress' ? 'In progress' : status}
          </ToggleButton>
        ))}
      </div>
    </fieldset>
  );
}

function FilterBarDateRange() {
  const { filters, setDateRange } = useFilterBar();

  return (
    <div className="filter-bar__group">
      <span className="filter-bar__legend">Scheduled between</span>

      <div className="filter-bar__dates">
        <TextField
          label="From"
          type="date"
          value={filters.scheduledFrom ?? ''}
          onValueChange={(value) => setDateRange(value.length > 0 ? value : null, filters.scheduledTo)}
          testId="filter-date-from"
        />

        <TextField
          label="To"
          type="date"
          value={filters.scheduledTo ?? ''}
          onValueChange={(value) => setDateRange(filters.scheduledFrom, value.length > 0 ? value : null)}
          testId="filter-date-to"
        />
      </div>
    </div>
  );
}

function FilterBarReset() {
  const { hasActiveFilters, reset } = useFilterBar();

  return (
    <div className="filter-bar__group">
      <Button onClick={reset} disabled={!hasActiveFilters} data-testid="filter-reset">
        Clear filters
      </Button>
    </div>
  );
}

/**
 * The compound namespace.
 *
 * Attaching the sub-components to the root is what makes the relationship visible
 * at the call site: `<FilterBar.Status />` cannot be mistaken for a standalone
 * component that works anywhere, which is exactly the mistake a separately
 * exported `<StatusFilter />` invites.
 */
export const FilterBar = Object.assign(FilterBarRoot, {
  Search: FilterBarSearch,
  Status: FilterBarStatus,
  DateRange: FilterBarDateRange,
  Reset: FilterBarReset,
});
