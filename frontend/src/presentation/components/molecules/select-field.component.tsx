'use client';

import { useId } from 'react';
import type { SelectHTMLAttributes } from 'react';

export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

interface SelectFieldProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange' | 'id' | 'children'> {
  readonly label: string;
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly options: readonly SelectOption[];
  /** Shown as the empty first option, so "nothing chosen" is a visible state. */
  readonly placeholder: string;
  readonly error?: string | undefined;
  readonly hint?: string | undefined;
  readonly testId?: string;
}

/**
 * A labelled dropdown.
 *
 * ## Why it mirrors `TextField` exactly
 *
 * Same props, same class names, same `useId` wiring for the label and
 * `aria-describedby`. A form built from controls that disagree about how they
 * report errors is a form where one of them eventually stops reporting them.
 *
 * ## Why a native `<select>`
 *
 * A custom listbox means reimplementing keyboard navigation, type-ahead, the
 * mobile picker and the screen-reader semantics that the platform control already
 * has — and reimplementing them slightly wrong. There is nothing in this form
 * that a native select cannot do.
 *
 * ## Why the placeholder option is disabled rather than absent
 *
 * It has to be selectable-looking so the field can render "nothing chosen", but
 * choosing it again would be a way to un-answer a required question. Disabled, it
 * shows the empty state and cannot be picked.
 */
export function SelectField({
  label,
  value,
  onValueChange,
  options,
  placeholder,
  error,
  hint,
  testId,
  ...rest
}: SelectFieldProps) {
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

      <select
        {...rest}
        id={id}
        className="field__control"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        aria-invalid={error !== undefined}
        aria-describedby={describedBy.length > 0 ? describedBy : undefined}
        data-testid={testId}
      >
        <option value="" disabled>
          {placeholder}
        </option>

        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

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
