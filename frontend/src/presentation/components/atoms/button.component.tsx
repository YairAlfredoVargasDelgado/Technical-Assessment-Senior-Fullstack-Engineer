'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'default' | 'primary' | 'danger' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  readonly children: ReactNode;
}

/**
 * An atom.
 *
 * Holds no state and makes no decisions — everything comes in through props,
 * including `onClick`. That is what keeps it reusable: a button that knew about
 * jobs could only ever be used on the jobs screen.
 *
 * `type` defaults to `"button"` rather than the HTML default of `"submit"`.
 * Inside a form, an un-typed button submits it, so a "Cancel" button silently
 * becomes a second submit button. Defaulting the safe way makes submission
 * something you opt into.
 */
export function Button({ variant = 'default', type = 'button', children, ...rest }: ButtonProps) {
  const className = variant === 'default' ? 'button' : `button button--${variant}`;

  return (
    <button type={type} className={className} {...rest}>
      {children}
    </button>
  );
}
