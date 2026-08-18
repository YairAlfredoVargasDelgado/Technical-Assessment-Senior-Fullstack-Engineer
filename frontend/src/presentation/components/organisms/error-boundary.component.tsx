'use client';

import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  readonly children: ReactNode;
  /** Rendered instead of the children when a descendant throws. */
  readonly fallback: (error: Error, reset: () => void) => ReactNode;
  readonly onError?: (error: Error, info: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  readonly error: Error | null;
}

/**
 * Catches render-time errors in its subtree.
 *
 * ## Why this is a class in a codebase with no other classes
 *
 * There is no hook equivalent. `componentDidCatch` and
 * `getDerivedStateFromError` have no functional counterpart, and React has never
 * shipped one — so an error boundary is a class or it is not an error boundary.
 * Writing it once and reusing it is how the rest of the codebase stays hooks-only.
 *
 * ## What it catches, and what it does not
 *
 * It catches errors thrown while *rendering* a descendant. It does not catch
 * errors in event handlers or in promises, because those do not unwind through
 * React's render. Those are handled where they occur — see how the feature hooks
 * return an `error` from their Server Action calls rather than throwing.
 *
 * ## Why it is separate from `app/jobs/error.tsx`
 *
 * The route-level `error.tsx` replaces the *entire page* when anything in it
 * throws. That is right for a failed data fetch and much too coarse for one bad
 * row: a single malformed job should degrade the table, not blank the screen. So
 * the table is wrapped in this boundary as well, and the two nest.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public override state: ErrorBoundaryState = { error: null };

  public static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  public override componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info);
  }

  private readonly reset = (): void => {
    this.setState({ error: null });
  };

  public override render(): ReactNode {
    const { error } = this.state;

    return error === null ? this.props.children : this.props.fallback(error, this.reset);
  }
}

/**
 * The default fallback for the jobs table.
 *
 * `role="alert"` announces it the moment it appears, and the retry button clears
 * the boundary's state so the subtree re-mounts — which is enough to recover from
 * a transient render failure without a full page reload.
 */
export function TableErrorFallback(error: Error, reset: () => void) {
  return (
    <div className="alert alert--error" role="alert" data-testid="jobs-table-error">
      <p style={{ margin: '0 0 12px' }}>
        <strong>The job list could not be displayed.</strong> {error.message}
      </p>

      <button type="button" className="button" onClick={reset} data-testid="jobs-table-error-retry">
        Try again
      </button>
    </div>
  );
}
