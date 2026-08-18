'use client';

import { useId } from 'react';
import type { InputHTMLAttributes } from 'react';

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'id'> {
  readonly label: string;
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly error?: string | undefined;
  readonly hint?: string | undefined;
  readonly testId?: string;
}

/**
 * A labelled text input.
 *
 * ## Controlled Component pattern
 *
 * It holds no state. The parent owns `value` and receives `onValueChange`, which
 * is what lets the create-job form keep every field in one `useReducer` and
 * cross-validate them — impossible if each input kept its own copy.
 *
 * `onValueChange(string)` rather than `onChange(event)` so callers never touch
 * `event.target.value`, and so the component could be re-implemented over a
 * different control without changing a single call site.
 *
 * ## Accessibility
 *
 * `useId` generates a collision-free id that is stable across server and client
 * render, so the `<label for>` association survives hydration. The error is tied
 * to the input with `aria-describedby` and marked `role="alert"`, so a screen
 * reader announces it when it appears rather than only when the field is next
 * focused.
 */
export function TextField({
  label,
  value,
  onValueChange,
  error,
  hint,
  testId,
  ...rest
}: TextFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  const describedBy = [error !== undefined ? errorId : null, hint !== undefined ? hintId : null]
    .filter((token): token is string => token !== null)
    .join(' ');

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>

      <input
        {...rest}
        id={id}
        className="field__control"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        aria-invalid={error !== undefined}
        aria-describedby={describedBy.length > 0 ? describedBy : undefined}
        data-testid={testId}
      />

      {hint !== undefined ? (
        <span className="field__hint" id={hintId}>
          {hint}
        </span>
      ) : null}

      {error !== undefined ? (
        <span className="field__error" id={errorId} role="alert" data-testid={testId ? `${testId}-error` : undefined}>
          {error}
        </span>
      ) : null}
    </div>
  );
}
