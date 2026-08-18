'use client';

import type { ReactNode } from 'react';

interface ToggleButtonProps {
  readonly pressed: boolean;
  readonly onToggle: () => void;
  readonly children: ReactNode;
  readonly testId?: string;
}

/**
 * A two-state button.
 *
 * `aria-pressed` rather than styling alone: to a screen reader an unmarked button
 * with a different background is indistinguishable from any other button, so a
 * filter that is *on* is invisible. This is the whole reason it is a separate atom
 * from `Button` — the semantics differ, not just the styling.
 */
export function ToggleButton({ pressed, onToggle, children, testId }: ToggleButtonProps) {
  return (
    <button
      type="button"
      className={pressed ? 'button button--pressed' : 'button'}
      aria-pressed={pressed}
      onClick={onToggle}
      data-testid={testId}
    >
      {children}
    </button>
  );
}
