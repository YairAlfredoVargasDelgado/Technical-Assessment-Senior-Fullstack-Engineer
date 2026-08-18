'use client';

import { Button } from '@/presentation/components/atoms/button.component';
import { ToggleButton } from '@/presentation/components/atoms/toggle-button.component';
import { Modal } from '@/presentation/components/molecules/modal.component';
import { TextField } from '@/presentation/components/molecules/text-field.component';

import type { UseCreateJobResult } from '../../hooks/use-create-job.hook';

interface CreateJobModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Every piece of behaviour, supplied by the orchestrating hook. */
  readonly form: UseCreateJobResult;
}

/**
 * The create-job dialog.
 *
 * ## A thin shell
 *
 * Read the file: there is no `useState`, no `useEffect`, no validation, no fetch
 * and no handler body beyond forwarding a value. Everything comes from `form`,
 * which the page hook builds with `useCreateJob`.
 *
 * That is not stylistic. It means the form's behaviour is testable by calling a
 * function, and that this component can be rendered in isolation with a stub
 * `form` object — no server, no store, no router.
 *
 * ## Controlled inputs throughout
 *
 * Each `TextField` receives `value` and `onValueChange`. None of them owns its
 * text. That is what makes the mode toggle able to clear two fields at once, and
 * what makes the whole form one atomic reducer transition rather than eleven
 * independent ones.
 */
export function CreateJobModal({ open, onClose, form }: CreateJobModalProps) {
  const isScheduled = form.values.mode === 'scheduled';

  return (
    <Modal
      open={open}
      title="Create a job"
      onClose={onClose}
      testId="create-job-modal"
      footer={
        <>
          <Button onClick={onClose} data-testid="create-job-cancel">
            Cancel
          </Button>

          <Button
            variant="primary"
            onClick={() => void form.submit()}
            disabled={!form.isValid || form.isSubmitting}
            data-testid="create-job-submit"
          >
            {form.isSubmitting ? 'Creating…' : 'Create job'}
          </Button>
        </>
      }
    >
      {form.serverError !== null ? (
        <p className="alert alert--error" role="alert" data-testid="create-job-server-error">
          {form.serverError.message}
        </p>
      ) : null}

      <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
        <legend className="field__label">Scheduling</legend>

        <div className="toolbar" role="group" aria-label="Scheduling mode">
          <ToggleButton
            pressed={isScheduled}
            onToggle={() => form.setMode('scheduled')}
            testId="create-job-mode-scheduled"
          >
            Schedule now
          </ToggleButton>

          <ToggleButton
            pressed={!isScheduled}
            onToggle={() => form.setMode('draft')}
            testId="create-job-mode-draft"
          >
            Save as draft
          </ToggleButton>
        </div>
      </fieldset>

      <TextField
        label="Title"
        value={form.values.title}
        onValueChange={(value) => form.setField('title', value)}
        onBlur={() => form.blurField('title')}
        error={form.visibleErrors.title}
        testId="create-job-title"
        required
      />

      <TextField
        label="Description"
        value={form.values.description}
        onValueChange={(value) => form.setField('description', value)}
        onBlur={() => form.blurField('description')}
        error={form.visibleErrors.description}
        testId="create-job-description"
      />

      <TextField
        label="Street"
        value={form.values.street}
        onValueChange={(value) => form.setField('street', value)}
        onBlur={() => form.blurField('street')}
        error={form.visibleErrors.street}
        testId="create-job-street"
        required
      />

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
        <TextField
          label="City"
          value={form.values.city}
          onValueChange={(value) => form.setField('city', value)}
          onBlur={() => form.blurField('city')}
          error={form.visibleErrors.city}
          testId="create-job-city"
          required
        />

        <TextField
          label="State"
          value={form.values.state}
          onValueChange={(value) => form.setField('state', value)}
          onBlur={() => form.blurField('state')}
          error={form.visibleErrors.state}
          testId="create-job-state"
          required
        />

        <TextField
          label="Zip code"
          value={form.values.zipCode}
          onValueChange={(value) => form.setField('zipCode', value)}
          onBlur={() => form.blurField('zipCode')}
          error={form.visibleErrors.zipCode}
          testId="create-job-zip"
          required
        />
      </div>

      <TextField
        label="Customer"
        value={form.values.customerId}
        onValueChange={(value) => form.setField('customerId', value)}
        onBlur={() => form.blurField('customerId')}
        error={form.visibleErrors.customerId}
        hint="Customer identifier (UUID). A real deployment renders a picker backed by the Contacts module."
        testId="create-job-customer"
        required
      />

      {/*
        A ternary, not `&&`. `isScheduled && <>…</>` is safe here, but the codebase
        applies one rule everywhere so nobody has to decide per site whether the
        left operand can be `0` or `''` — the case where `&&` renders the falsy
        value into the DOM. Enforced by an ESLint rule, not by review.
      */}
      {isScheduled ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <TextField
            label="Scheduled date"
            type="datetime-local"
            value={form.values.scheduledDate}
            onValueChange={(value) => form.setField('scheduledDate', value)}
            onBlur={() => form.blurField('scheduledDate')}
            error={form.visibleErrors.scheduledDate}
            testId="create-job-scheduled-date"
            required
          />

          <TextField
            label="Assignee"
            value={form.values.assigneeId}
            onValueChange={(value) => form.setField('assigneeId', value)}
            onBlur={() => form.blurField('assigneeId')}
            error={form.visibleErrors.assigneeId}
            hint="Crew member identifier (UUID)."
            testId="create-job-assignee"
            required
          />
        </div>
      ) : null}
    </Modal>
  );
}
