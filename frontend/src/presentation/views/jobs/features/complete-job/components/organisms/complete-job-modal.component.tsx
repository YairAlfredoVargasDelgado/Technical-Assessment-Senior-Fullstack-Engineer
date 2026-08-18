'use client';

import { Button } from '@/presentation/components/atoms/button.component';
import { Modal } from '@/presentation/components/molecules/modal.component';
import { TextField } from '@/presentation/components/molecules/text-field.component';

import type { UseCompleteJobResult } from '../../hooks/use-complete-job.hook';

/**
 * The completion dialog.
 *
 * Another thin shell: no state, no handlers, no validation. It reads `completion`
 * and calls back into it. The only expression in the file is
 * `signatureUrl.trim().length === 0`, which decides whether the confirm button is
 * enabled — a rendering decision, which is what a shell is allowed to make.
 */
export function CompleteJobModal({ completion }: { readonly completion: UseCompleteJobResult }) {
  const { target } = completion;
  const canConfirm = completion.signatureUrl.trim().length > 0 && !completion.isSubmitting;

  return (
    <Modal
      open={target !== null}
      title={target === null ? 'Complete job' : `Complete “${target.title}”`}
      onClose={completion.close}
      testId="complete-job-modal"
      footer={
        <>
          <Button onClick={completion.close} data-testid="complete-job-cancel">
            Cancel
          </Button>

          <Button
            variant="primary"
            onClick={() => void completion.confirm()}
            disabled={!canConfirm}
            data-testid="complete-job-submit"
          >
            {completion.isSubmitting ? 'Completing…' : 'Complete job'}
          </Button>
        </>
      }
    >
      {completion.error !== null ? (
        <p className="alert alert--error" role="alert" data-testid="complete-job-error">
          {completion.error.message}
        </p>
      ) : null}

      <TextField
        label="Customer signature URL"
        type="url"
        value={completion.signatureUrl}
        onValueChange={completion.setSignatureUrl}
        hint="The backend requires an absolute http(s) URL and rejects a completion without one."
        placeholder="https://cdn.example.com/signatures/abc.png"
        testId="complete-job-signature"
        required
      />
    </Modal>
  );
}
