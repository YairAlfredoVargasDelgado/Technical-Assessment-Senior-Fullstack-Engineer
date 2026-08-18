import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CreateJobFormValues } from './use-create-job.hook';

/**
 * Mocks are declared before the module under test is imported, because `vi.mock`
 * is hoisted and the hook captures these references at import time.
 */
const createJobAction = vi.fn();
const refresh = vi.fn();

vi.mock('@app/jobs/actions', () => ({
  createJobAction: (...args: unknown[]) => createJobAction(...args),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

// The runtime import is deferred so the mocks above are installed first. The
// type import is erased at compile time, so it can sit at the top as normal.
const { createJobReducer, useCreateJob, validateCreateJob } = await import('./use-create-job.hook');

const NOW = '2030-06-01T09:00';
const VALID_UUID = '33333333-3333-3333-3333-333333333333';

function values(overrides: Partial<CreateJobFormValues> = {}): CreateJobFormValues {
  return {
    mode: 'scheduled',
    title: 'Roof inspection',
    description: '',
    street: '12 Elm Street',
    city: 'Newark',
    state: 'NJ',
    zipCode: '07102',
    customerId: VALID_UUID,
    scheduledDate: '2030-06-05T09:00',
    assigneeId: VALID_UUID,
    ...overrides,
  };
}

beforeEach(() => {
  createJobAction.mockReset();
  refresh.mockReset();
  createJobAction.mockResolvedValue({ ok: true, value: 'new-job-id' });
});

/* -------------------------------------------------------------------------- */
/* The reducer — testable without React at all                                */
/* -------------------------------------------------------------------------- */

describe('createJobReducer', () => {
  const initial = {
    values: values({ title: '', street: '', city: '', state: '', zipCode: '', customerId: '', scheduledDate: '', assigneeId: '' }),
    touched: {},
    status: 'editing' as const,
    serverError: null,
    createdJobId: null,
  };

  it('updates a single field', () => {
    const next = createJobReducer(initial, { type: 'field-changed', field: 'title', value: 'Roof' });

    expect(next.values.title).toBe('Roof');
  });

  it('clears a server error as soon as the user edits', () => {
    const withError = { ...initial, serverError: { code: 'Job.TitleRequired', message: 'Title is required.' } };

    const next = createJobReducer(withError, { type: 'field-changed', field: 'title', value: 'R' });

    // The server's objection was about text that no longer exists.
    expect(next.serverError).toBeNull();
  });

  it('marks a field as touched on blur without changing its value', () => {
    const next = createJobReducer(initial, { type: 'field-blurred', field: 'title' });

    expect(next.touched.title).toBe(true);
    expect(next.values.title).toBe(initial.values.title);
  });

  /**
   * The transition that justifies `useReducer`. Switching to draft changes the
   * mode, clears two fields and drops two touched flags — four updates that must
   * happen together or not at all.
   */
  it('clears the scheduling fields together with the mode', () => {
    const scheduled = {
      ...initial,
      values: values(),
      touched: { scheduledDate: true, assigneeId: true },
    };

    const next = createJobReducer(scheduled, { type: 'mode-changed', mode: 'draft' });

    expect(next.values.mode).toBe('draft');
    expect(next.values.scheduledDate).toBe('');
    expect(next.values.assigneeId).toBe('');
    expect(next.touched.scheduledDate).toBe(false);
    expect(next.touched.assigneeId).toBe(false);
  });

  it('leaves the scheduling fields alone when switching back to scheduled', () => {
    const draft = { ...initial, values: values({ mode: 'draft', scheduledDate: '', assigneeId: '' }) };

    const next = createJobReducer(draft, { type: 'mode-changed', mode: 'scheduled' });

    expect(next.values.mode).toBe('scheduled');
    expect(next.values.scheduledDate).toBe('');
  });

  it('clears a stale error when submission starts', () => {
    const withError = { ...initial, serverError: { code: 'X', message: 'Boom' } };

    const next = createJobReducer(withError, { type: 'submit-started' });

    // A previous failure must not sit under a spinner.
    expect(next.status).toBe('submitting');
    expect(next.serverError).toBeNull();
  });

  it('returns to editing and surfaces the error when submission fails', () => {
    const submitting = { ...initial, status: 'submitting' as const };
    const error = { code: 'Job.ScheduledInThePast', message: 'A job cannot be scheduled in the past.' };

    const next = createJobReducer(submitting, { type: 'submit-failed', error });

    expect(next.status).toBe('editing');
    expect(next.serverError).toEqual(error);
    // The values survive so the user can correct them rather than retype.
    expect(next.values).toEqual(submitting.values);
  });

  it('resets the form on success and records the new id', () => {
    const filled = { ...initial, values: values(), touched: { title: true } };

    const next = createJobReducer(filled, { type: 'submit-succeeded', jobId: 'new-job-id' });

    expect(next.createdJobId).toBe('new-job-id');
    expect(next.values.title).toBe('');
    expect(next.touched).toEqual({});
  });
});

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

describe('validateCreateJob', () => {
  it('accepts a complete scheduled job', () => {
    expect(validateCreateJob(values(), NOW)).toEqual({});
  });

  it('requires the core fields', () => {
    const errors = validateCreateJob(
      values({ title: '  ', street: '', city: '', state: '', zipCode: '', customerId: '' }),
      NOW,
    );

    expect(Object.keys(errors)).toEqual(
      expect.arrayContaining(['title', 'street', 'city', 'state', 'zipCode', 'customerId']),
    );
  });

  it('rejects an over-long title', () => {
    expect(validateCreateJob(values({ title: 'x'.repeat(201) }), NOW).title).toBeDefined();
  });

  it('rejects a date in the past', () => {
    expect(validateCreateJob(values({ scheduledDate: '2030-05-31T09:00' }), NOW).scheduledDate)
      .toBe('A job cannot be scheduled in the past.');
  });

  it('does not require scheduling fields in draft mode', () => {
    const errors = validateCreateJob(
      values({ mode: 'draft', scheduledDate: '', assigneeId: '' }),
      NOW,
    );

    expect(errors.scheduledDate).toBeUndefined();
    expect(errors.assigneeId).toBeUndefined();
  });

  it('requires identifiers to be well-formed UUIDs', () => {
    expect(validateCreateJob(values({ customerId: 'not-a-uuid' }), NOW).customerId).toBeDefined();
    expect(validateCreateJob(values({ assigneeId: '12345' }), NOW).assigneeId).toBeDefined();
  });
});

/* -------------------------------------------------------------------------- */
/* The hook                                                                   */
/* -------------------------------------------------------------------------- */

describe('useCreateJob', () => {
  it('starts invalid and empty', () => {
    const { result } = renderHook(() => useCreateJob());

    expect(result.current.isValid).toBe(false);
    expect(result.current.values.title).toBe('');
  });

  /**
   * Errors are computed from the values, but only *shown* for fields the user has
   * visited. An untouched empty form that already shouts is worse than one that
   * waits.
   */
  it('hides errors until a field has been touched', () => {
    const { result } = renderHook(() => useCreateJob());

    expect(result.current.errors.title).toBeDefined();
    expect(result.current.visibleErrors.title).toBeUndefined();

    act(() => {
      result.current.blurField('title');
    });

    expect(result.current.visibleErrors.title).toBeDefined();
  });

  function fillValidForm(result: { current: ReturnType<typeof useCreateJob> }) {
    act(() => {
      result.current.setField('title', 'Roof inspection');
      result.current.setField('street', '12 Elm Street');
      result.current.setField('city', 'Newark');
      result.current.setField('state', 'NJ');
      result.current.setField('zipCode', '07102');
      result.current.setField('customerId', VALID_UUID);
      result.current.setField('assigneeId', VALID_UUID);
      result.current.setField('scheduledDate', '2035-06-05T09:00');
    });
  }

  it('becomes valid once every required field is filled', () => {
    const { result } = renderHook(() => useCreateJob());

    fillValidForm(result);

    expect(result.current.isValid).toBe(true);
  });

  it('calls the Server Action with an ISO date and trimmed values', async () => {
    const { result } = renderHook(() => useCreateJob());
    fillValidForm(result);

    await act(async () => {
      await result.current.submit();
    });

    expect(createJobAction).toHaveBeenCalledOnce();

    const payload = createJobAction.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.title).toBe('Roof inspection');
    // The form works in `datetime-local`; the API takes ISO-8601 UTC.
    expect(payload.scheduledDateUtc).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(payload.assigneeId).toBe(VALID_UUID);

    // Composed, not flattened: the flat wire format is the repository's concern.
    expect(payload.address).toEqual({
      street: '12 Elm Street',
      city: 'Newark',
      state: 'NJ',
      zipCode: '07102',
      latitude: null,
      longitude: null,
    });
  });

  /**
   * A draft must not carry half a schedule. The reducer clears the pair; this
   * asserts the payload reflects that, because the backend validator rejects one
   * without the other for a reason the user cannot see.
   */
  it('sends null scheduling fields in draft mode', async () => {
    const { result } = renderHook(() => useCreateJob());
    fillValidForm(result);

    act(() => {
      result.current.setMode('draft');
    });

    await act(async () => {
      await result.current.submit();
    });

    const payload = createJobAction.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.scheduledDateUtc).toBeNull();
    expect(payload.assigneeId).toBeNull();
  });

  it('refreshes the route and notifies the caller on success', async () => {
    const onCreated = vi.fn();
    const { result } = renderHook(() => useCreateJob(onCreated));
    fillValidForm(result);

    await act(async () => {
      await result.current.submit();
    });

    await waitFor(() => {
      expect(refresh).toHaveBeenCalledOnce();
    });
    expect(onCreated).toHaveBeenCalledWith('new-job-id');
  });

  it('surfaces a server failure and does not refresh', async () => {
    createJobAction.mockResolvedValue({
      ok: false,
      error: { code: 'Job.ScheduledInThePast', message: 'A job cannot be scheduled in the past.' },
    });

    const { result } = renderHook(() => useCreateJob());
    fillValidForm(result);

    await act(async () => {
      await result.current.submit();
    });

    expect(result.current.serverError?.code).toBe('Job.ScheduledInThePast');
    expect(result.current.isSubmitting).toBe(false);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('does not submit an invalid form', async () => {
    const { result } = renderHook(() => useCreateJob());

    await act(async () => {
      await result.current.submit();
    });

    expect(createJobAction).not.toHaveBeenCalled();
  });

  it('clears the form on reset', () => {
    const { result } = renderHook(() => useCreateJob());
    fillValidForm(result);

    act(() => {
      result.current.reset();
    });

    expect(result.current.values.title).toBe('');
    expect(result.current.isValid).toBe(false);
  });
});
