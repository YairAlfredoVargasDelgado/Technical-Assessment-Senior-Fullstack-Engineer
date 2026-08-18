import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Job } from '@/domain/entities/job/job.entity';
import { useJobsStore } from '@/presentation/stores/jobs.store';

const startJobAction = vi.fn();
const completeJobAction = vi.fn();
const refresh = vi.fn();

vi.mock('@app/jobs/actions', () => ({
  startJobAction: (...args: unknown[]) => startJobAction(...args),
  completeJobAction: (...args: unknown[]) => completeJobAction(...args),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

const { useCompleteJob } = await import('./use-complete-job.hook');

function job(overrides: Partial<Job> = {}): Job {
  return {
    id: 'job-1',
    title: 'Roof inspection',
    description: null,
    status: 'Scheduled',
    address: {
      street: '12 Elm Street',
      city: 'Newark',
      state: 'NJ',
      zipCode: '07102',
      latitude: null,
      longitude: null,
    },
    scheduledDateUtc: '2030-06-01T09:00:00Z',
    assigneeId: 'crew-7',
    customerId: 'customer-1',
    photoCount: 0,
    createdAtUtc: '2030-05-01T09:00:00Z',
    updatedAtUtc: '2030-05-01T09:00:00Z',
    ...overrides,
  };
}

const patches = () => useJobsStore.getState().optimisticPatches;

beforeEach(() => {
  useJobsStore.setState(useJobsStore.getInitialState(), true);
  startJobAction.mockReset();
  completeJobAction.mockReset();
  refresh.mockReset();
  startJobAction.mockResolvedValue({ ok: true, value: undefined });
  completeJobAction.mockResolvedValue({ ok: true, value: undefined });
});

describe('useCompleteJob — starting a job', () => {
  it('applies an optimistic patch and settles it on success', async () => {
    const { result } = renderHook(() => useCompleteJob());

    await act(async () => {
      await result.current.start(job());
    });

    expect(startJobAction).toHaveBeenCalledWith('job-1', 'Scheduled');
    await waitFor(() => {
      expect(refresh).toHaveBeenCalledOnce();
    });

    // Settled: the refreshed server data now carries the new status, so keeping
    // the patch would pin a stale value over any later change.
    expect(patches()).toEqual({});
  });

  /**
   * The behaviour that makes optimistic updates safe. The patch is dropped, so
   * the row falls straight back to whatever the server says — no snapshot to
   * capture, keep and correctly discard.
   */
  it('rolls the patch back and surfaces the error on failure', async () => {
    startJobAction.mockResolvedValue({
      ok: false,
      error: { code: 'Job.InvalidTransition', message: 'A job in state "Draft" cannot transition to "InProgress".' },
    });

    const { result } = renderHook(() => useCompleteJob());

    await act(async () => {
      await result.current.start(job({ status: 'Draft' }));
    });

    expect(patches()).toEqual({});
    expect(result.current.error?.code).toBe('Job.InvalidTransition');
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe('useCompleteJob — the dialog', () => {
  it('opens for a job and clears any previous signature and error', () => {
    const { result } = renderHook(() => useCompleteJob());

    act(() => {
      result.current.setSignatureUrl('https://cdn.example/stale.png');
      result.current.open(job());
    });

    expect(result.current.target?.id).toBe('job-1');
    expect(result.current.signatureUrl).toBe('');
    expect(result.current.error).toBeNull();
  });

  it('closes without submitting', () => {
    const { result } = renderHook(() => useCompleteJob());

    act(() => {
      result.current.open(job());
    });
    act(() => {
      result.current.close();
    });

    expect(result.current.target).toBeNull();
    expect(completeJobAction).not.toHaveBeenCalled();
  });
});

describe('useCompleteJob — completing a job', () => {
  async function openAndConfirm(
    result: { current: ReturnType<typeof useCompleteJob> },
    signatureUrl: string,
    target = job({ status: 'InProgress' }),
  ) {
    act(() => {
      result.current.open(target);
    });
    act(() => {
      result.current.setSignatureUrl(signatureUrl);
    });
    await act(async () => {
      await result.current.confirm();
    });
  }

  it('submits the trimmed signature with the current status', async () => {
    const { result } = renderHook(() => useCompleteJob());

    await openAndConfirm(result, '  https://cdn.example/sig.png  ');

    expect(completeJobAction).toHaveBeenCalledWith('job-1', 'https://cdn.example/sig.png', 'InProgress');
  });

  it('closes the dialog and settles the patch on success', async () => {
    const { result } = renderHook(() => useCompleteJob());

    await openAndConfirm(result, 'https://cdn.example/sig.png');

    await waitFor(() => {
      expect(refresh).toHaveBeenCalledOnce();
    });
    expect(result.current.target).toBeNull();
    expect(patches()).toEqual({});
  });

  /**
   * The dialog stays open on failure. Closing it would discard the signature the
   * user just entered and give them nowhere to read the reason.
   */
  it('keeps the dialog open and rolls back on failure', async () => {
    completeJobAction.mockResolvedValue({
      ok: false,
      error: { code: 'Job.InvalidTransition', message: 'Cannot complete a scheduled job.' },
    });

    const { result } = renderHook(() => useCompleteJob());

    await openAndConfirm(result, 'https://cdn.example/sig.png', job({ status: 'Scheduled' }));

    expect(result.current.target).not.toBeNull();
    expect(result.current.error?.code).toBe('Job.InvalidTransition');
    expect(patches()).toEqual({});
  });

  it('refuses to submit without a signature', async () => {
    const { result } = renderHook(() => useCompleteJob());

    await openAndConfirm(result, '   ');

    expect(completeJobAction).not.toHaveBeenCalled();
  });

  it('does nothing when no job is targeted', async () => {
    const { result } = renderHook(() => useCompleteJob());

    await act(async () => {
      await result.current.confirm();
    });

    expect(completeJobAction).not.toHaveBeenCalled();
  });
});
