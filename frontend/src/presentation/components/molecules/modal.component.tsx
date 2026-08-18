'use client';

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

interface ModalProps {
  readonly open: boolean;
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  readonly testId?: string;
}

/**
 * A modal dialog built on the native `<dialog>` element.
 *
 * ## Why the platform element rather than a div with a high z-index
 *
 * `showModal()` gives four behaviours for free that a hand-rolled overlay has to
 * reimplement, and usually reimplements incompletely:
 *
 * - **Focus trapping.** Tab cannot escape to the page behind. Getting this right
 *   by hand means tracking every focusable descendant and handling Shift+Tab.
 * - **Inertness of the background.** Content behind the dialog is removed from
 *   the accessibility tree, so a screen reader cannot wander into it.
 * - **Escape to close**, which fires the `cancel` event handled below.
 * - **A real top layer**, so no `z-index` can render over it.
 *
 * ## Why the effect drives the element rather than the JSX
 *
 * `<dialog>` opens through an imperative call, not an attribute — rendering
 * `<dialog open>` produces a *non-modal* dialog with none of the above. So the
 * `open` prop is translated into `showModal()` / `close()`, which keeps the
 * component's public API declarative while using the element correctly.
 */
export function Modal({ open, title, onClose, children, footer, testId }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) {
      return;
    }

    if (open && !dialog.open) {
      dialog.showModal();
      return;
    }

    if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="modal"
      aria-labelledby={`${testId ?? 'modal'}-title`}
      data-testid={testId}
      // Fired by Escape. Routed through onClose so the parent's state stays the
      // single source of truth for whether the dialog is open — otherwise the
      // element would be closed while the parent still believed it open, and the
      // next open would be a no-op.
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="modal__header">
        <h2 className="modal__title" id={`${testId ?? 'modal'}-title`}>
          {title}
        </h2>

        <button type="button" className="button button--ghost" onClick={onClose} aria-label="Close dialog">
          ✕
        </button>
      </div>

      <div className="modal__body">{children}</div>

      {footer !== undefined ? <div className="modal__footer">{footer}</div> : null}
    </dialog>
  );
}
