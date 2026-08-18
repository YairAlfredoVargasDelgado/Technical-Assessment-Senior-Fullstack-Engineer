'use client';

import { useCallback, useMemo, useReducer } from 'react';
import { useRouter } from 'next/navigation';

import { createJobAction } from '@app/jobs/actions';
import type { AppError } from '@/domain/errors';

/* -------------------------------------------------------------------------- */
/* Form model                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Whether the job is being filed for later or booked in now.
 *
 * A real mode rather than "did they fill in the date?": the two produce different
 * commands on the backend (`CreateDraft` vs `CreateScheduled`) and have different
 * required fields, so the form must know which one the user intends before they
 * have finished typing.
 */
export type CreateJobMode = 'draft' | 'scheduled';

export interface CreateJobFormValues {
  readonly mode: CreateJobMode;
  readonly title: string;
  readonly description: string;
  readonly street: string;
  readonly city: string;
  readonly state: string;
  readonly zipCode: string;
  readonly customerId: string;
  readonly scheduledDate: string;
  readonly assigneeId: string;
}

export type CreateJobField = Exclude<keyof CreateJobFormValues, 'mode'>;

const EMPTY_VALUES: CreateJobFormValues = {
  mode: 'scheduled',
  title: '',
  description: '',
  street: '',
  city: '',
  state: '',
  zipCode: '',
  customerId: '',
  scheduledDate: '',
  assigneeId: '',
};

interface CreateJobFormState {
  readonly values: CreateJobFormValues;
  /** Which fields the user has interacted with — errors are hidden until then. */
  readonly touched: Readonly<Partial<Record<CreateJobField, boolean>>>;
  readonly status: 'editing' | 'submitting';
  readonly serverError: AppError | null;
  /** Set once, after a successful submit, so the modal knows to close. */
  readonly createdJobId: string | null;
}

const INITIAL_STATE: CreateJobFormState = {
  values: EMPTY_VALUES,
  touched: {},
  status: 'editing',
  serverError: null,
  createdJobId: null,
};

type CreateJobAction =
  | { readonly type: 'field-changed'; readonly field: CreateJobField; readonly value: string }
  | { readonly type: 'field-blurred'; readonly field: CreateJobField }
  | { readonly type: 'mode-changed'; readonly mode: CreateJobMode }
  | { readonly type: 'submit-started' }
  | { readonly type: 'submit-failed'; readonly error: AppError }
  | { readonly type: 'submit-succeeded'; readonly jobId: string }
  | { readonly type: 'reset' };

/**
 * The form's state transitions.
 *
 * ## Why `useReducer` and not eleven `useState` calls
 *
 * Every action below changes **more than one field at once**, and that is the
 * whole argument:
 *
 * - `mode-changed` switches the mode *and* clears the scheduling fields *and*
 *   drops their touched flags. With separate `useState`s that is four setter
 *   calls that a future edit can get out of step, and the bug — a stale assignee
 *   sent with a draft — is silent.
 * - `submit-started` sets the status *and* clears the previous server error, so a
 *   stale failure cannot sit under a spinner.
 * - `field-changed` updates the value *and* clears the server error, because the
 *   moment the user edits, the server's complaint is about text that no longer
 *   exists.
 *
 * A reducer makes each of those one atomic, named, testable transition. That the
 * transitions are testable without React at all is why `use-create-job.test.ts`
 * can exercise the whole form by calling this function.
 */
export function createJobReducer(
  state: CreateJobFormState,
  action: CreateJobAction,
): CreateJobFormState {
  switch (action.type) {
    case 'field-changed':
      return {
        ...state,
        values: { ...state.values, [action.field]: action.value },
        // Editing invalidates the server's objection to the previous value.
        serverError: null,
      };

    case 'field-blurred':
      return { ...state, touched: { ...state.touched, [action.field]: true } };

    case 'mode-changed':
      return {
        ...state,
        values: {
          ...state.values,
          mode: action.mode,
          // Cleared together with the mode. A draft carrying a leftover date and
          // assignee would be rejected by the backend validator for a reason the
          // user cannot see, because the fields are no longer on screen.
          scheduledDate: action.mode === 'draft' ? '' : state.values.scheduledDate,
          assigneeId: action.mode === 'draft' ? '' : state.values.assigneeId,
        },
        touched: action.mode === 'draft'
          ? { ...state.touched, scheduledDate: false, assigneeId: false }
          : state.touched,
        serverError: null,
      };

    case 'submit-started':
      return { ...state, status: 'submitting', serverError: null };

    case 'submit-failed':
      return { ...state, status: 'editing', serverError: action.error };

    case 'submit-succeeded':
      return { ...INITIAL_STATE, createdJobId: action.jobId };

    case 'reset':
      return INITIAL_STATE;
  }
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

export type CreateJobErrors = Readonly<Partial<Record<CreateJobField, string>>>;

/**
 * Derives the errors from the values.
 *
 * ## Why errors are not state
 *
 * Storing them would create a second source of truth that has to be recomputed on
 * every keystroke and can disagree with the values it describes. They are a pure
 * function of the values, so they are computed — the same reasoning that keeps
 * `filteredJobs` out of the store.
 *
 * ## What this validates, and what it does not
 *
 * Shape and immediacy: required fields, obviously-wrong dates, well-formed
 * identifiers. It does **not** re-implement the backend's invariants. "A job
 * cannot be scheduled in the past" appears here as a courtesy check against the
 * browser's clock so the user gets instant feedback — the authoritative check is
 * the aggregate's, against the server's clock, and the two can legitimately
 * disagree by a few seconds. That is why a rejection from the server is displayed
 * rather than assumed impossible.
 */
export function validateCreateJob(values: CreateJobFormValues, nowIso: string): CreateJobErrors {
  const errors: Record<string, string> = {};

  if (values.title.trim().length === 0) {
    errors.title = 'A title is required.';
  } else if (values.title.trim().length > 200) {
    errors.title = 'A title may be at most 200 characters.';
  }

  if (values.street.trim().length === 0) {
    errors.street = 'A street is required.';
  }

  if (values.city.trim().length === 0) {
    errors.city = 'A city is required.';
  }

  if (values.state.trim().length === 0) {
    errors.state = 'A state is required.';
  }

  if (values.zipCode.trim().length === 0) {
    errors.zipCode = 'A zip code is required.';
  }

  if (!UUID_PATTERN.test(values.customerId.trim())) {
    errors.customerId = 'A customer must be selected.';
  }

  if (values.mode === 'scheduled') {
    if (values.scheduledDate.length === 0) {
      errors.scheduledDate = 'A scheduled date is required.';
    } else if (values.scheduledDate < nowIso) {
      errors.scheduledDate = 'A job cannot be scheduled in the past.';
    }

    if (!UUID_PATTERN.test(values.assigneeId.trim())) {
      errors.assigneeId = 'A crew member must be assigned.';
    }
  }

  return errors;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* -------------------------------------------------------------------------- */
/* Hook                                                                       */
/* -------------------------------------------------------------------------- */

export interface UseCreateJobResult {
  readonly values: CreateJobFormValues;
  readonly errors: CreateJobErrors;
  /** Errors filtered to fields the user has already touched. */
  readonly visibleErrors: CreateJobErrors;
  readonly isValid: boolean;
  readonly isSubmitting: boolean;
  readonly serverError: AppError | null;
  readonly setField: (field: CreateJobField, value: string) => void;
  readonly blurField: (field: CreateJobField) => void;
  readonly setMode: (mode: CreateJobMode) => void;
  readonly submit: () => Promise<void>;
  readonly reset: () => void;
}

/**
 * All of the create-job feature's behaviour.
 *
 * The modal that uses it renders and does nothing else — no `useState`, no
 * handlers built inline, no validation. That separation is what "organisms are
 * thin shells" means in practice, and it is what lets this hook be tested by
 * calling it, with no DOM involved.
 */
export function useCreateJob(onCreated?: (jobId: string) => void): UseCreateJobResult {
  const [state, dispatch] = useReducer(createJobReducer, INITIAL_STATE);
  const router = useRouter();

  // Evaluated once per render rather than per validated field, so every rule in
  // one pass compares against the same instant.
  const nowIso = new Date().toISOString().slice(0, 16);

  const errors = useMemo(() => validateCreateJob(state.values, nowIso), [state.values, nowIso]);

  /**
   * Only errors for fields the user has already visited.
   *
   * Showing "A title is required" on an untouched, empty form is technically
   * accurate and reads as the form shouting before the user has done anything.
   */
  const visibleErrors = useMemo(() => {
    const entries = Object.entries(errors).filter(([field]) => state.touched[field as CreateJobField] === true);
    return Object.fromEntries(entries) as CreateJobErrors;
  }, [errors, state.touched]);

  const isValid = Object.keys(errors).length === 0;

  const setField = useCallback((field: CreateJobField, value: string) => {
    dispatch({ type: 'field-changed', field, value });
  }, []);

  const blurField = useCallback((field: CreateJobField) => {
    dispatch({ type: 'field-blurred', field });
  }, []);

  const setMode = useCallback((mode: CreateJobMode) => {
    dispatch({ type: 'mode-changed', mode });
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: 'reset' });
  }, []);

  const submit = useCallback(async () => {
    if (!isValid || state.status === 'submitting') {
      return;
    }

    dispatch({ type: 'submit-started' });

    const { values } = state;
    const isScheduled = values.mode === 'scheduled';

    const result = await createJobAction({
      title: values.title.trim(),
      description: values.description.trim().length > 0 ? values.description.trim() : null,
      address: {
        street: values.street.trim(),
        city: values.city.trim(),
        state: values.state.trim(),
        zipCode: values.zipCode.trim(),
        // Geocoding happens server-side; the form does not ask a user for
        // coordinates.
        latitude: null,
        longitude: null,
      },
      customerId: values.customerId.trim(),
      // Sent together or not at all — the backend validator rejects one without
      // the other, and the reducer has already guaranteed they move as a pair.
      scheduledDateUtc: isScheduled ? new Date(values.scheduledDate).toISOString() : null,
      assigneeId: isScheduled ? values.assigneeId.trim() : null,
    });

    if (!result.ok) {
      dispatch({ type: 'submit-failed', error: result.error });
      return;
    }

    dispatch({ type: 'submit-succeeded', jobId: result.value });

    // The Server Action already revalidated the route's cache; this pulls the
    // refreshed server render into the current page. Together they are what
    // makes the new row appear without a full navigation.
    router.refresh();

    onCreated?.(result.value);
  }, [isValid, state, router, onCreated]);

  return {
    values: state.values,
    errors,
    visibleErrors,
    isValid,
    isSubmitting: state.status === 'submitting',
    serverError: state.serverError,
    setField,
    blurField,
    setMode,
    submit,
    reset,
  };
}
