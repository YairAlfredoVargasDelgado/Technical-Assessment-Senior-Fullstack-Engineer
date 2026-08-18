'use server';

import { revalidatePath } from 'next/cache';

import type { CreateJobInput } from '@/application/ports/job-repository.port';
import type { JobStatus } from '@/domain/entities/job';
import type { AppResult } from '@/domain/errors';
import { err, UNKNOWN_ERROR } from '@/domain/errors';
import { container } from '@/infrastructure/container';

/**
 * Server Actions for the jobs route.
 *
 * ## Mutations only
 *
 * There is no `searchJobsAction` here, and its absence is deliberate. A Server
 * Action is a `POST` that Next.js serialises against other actions and that opts
 * the route out of static rendering — correct for a write, actively harmful for a
 * read. Reads are fetched by the Server Component and passed down as props.
 *
 * ## Why every action returns `AppResult` instead of throwing
 *
 * In production Next.js redacts errors thrown inside a Server Action before they
 * reach the browser: the client receives "An error occurred in the Server
 * Components render" and a digest. For a genuine fault that is right. For "the
 * title is required" it is useless — the form has nothing to display and the user
 * is told nothing.
 *
 * Returning the failure keeps it structured and serialisable all the way to the
 * hook that renders it.
 *
 * ## `revalidatePath`
 *
 * After a successful write the server's cached render of `/jobs` is stale. This
 * marks it for regeneration, so the client's `router.refresh()` receives current
 * rows rather than the ones it already had — which is what lets the optimistic
 * patch be dropped instead of being kept as a permanent local override.
 */

export async function createJobAction(input: CreateJobInput): Promise<AppResult<string>> {
  try {
    const result = await container().createJob.execute(input);

    if (result.ok) {
      revalidatePath('/jobs');
    }

    return result;
  } catch (error: unknown) {
    return err(toUnexpectedError(error));
  }
}

/**
 * Starts a job.
 *
 * `currentStatus` is a parameter because the transition guard needs it and the
 * action has no other way to know it without a round trip. The client is not
 * trusted with it — the backend aggregate re-checks the transition against the
 * persisted state, and its answer is the authoritative one. This only saves a
 * round trip for a transition the client can already prove illegal.
 */
export async function startJobAction(
  jobId: string,
  currentStatus: JobStatus,
): Promise<AppResult<void>> {
  try {
    const result = await container().transitionJob.start(jobId, currentStatus);

    if (result.ok) {
      revalidatePath('/jobs');
    }

    return result;
  } catch (error: unknown) {
    return err(toUnexpectedError(error));
  }
}

export async function completeJobAction(
  jobId: string,
  signatureUrl: string,
  currentStatus: JobStatus,
): Promise<AppResult<void>> {
  try {
    const result = await container().transitionJob.complete({ jobId, signatureUrl }, currentStatus);

    if (result.ok) {
      revalidatePath('/jobs');
    }

    return result;
  } catch (error: unknown) {
    return err(toUnexpectedError(error));
  }
}

export async function cancelJobAction(
  jobId: string,
  reason: string,
  currentStatus: JobStatus,
): Promise<AppResult<void>> {
  try {
    const result = await container().transitionJob.cancel({ jobId, reason }, currentStatus);

    if (result.ok) {
      revalidatePath('/jobs');
    }

    return result;
  } catch (error: unknown) {
    return err(toUnexpectedError(error));
  }
}

/**
 * The last line of defence.
 *
 * The repository already converts every expected failure — HTTP errors, timeouts,
 * unreachable host — into a returned `AppResult`. Anything that still throws is a
 * genuine defect, and it must not escape as an unhandled rejection that Next.js
 * would turn into an opaque digest. Logged server-side with detail, returned to
 * the client without it.
 */
function toUnexpectedError(error: unknown) {
  console.error('A jobs Server Action threw unexpectedly:', error);
  return UNKNOWN_ERROR;
}
