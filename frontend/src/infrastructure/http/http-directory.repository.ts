import 'server-only';

import type { AppResult } from '@/domain/errors';
import { ok } from '@/domain/errors';
import type { Directory, DirectoryEntry, DirectoryPort } from '@/application/ports/directory.port';

import { apiRequest } from './api-client';

/**
 * Reads the directory from the API.
 *
 * ## Why the two requests are concurrent
 *
 * They do not depend on each other, so awaiting them in sequence would make the
 * form wait for the sum of two round trips to render one dialog. `Promise.all`
 * makes it the slower of the two.
 *
 * ## Why a failure is not fatal
 *
 * An empty list is returned rather than an error. The directory is reference data
 * for a picker: if it cannot be reached, the right outcome is a form that says it
 * has no options to offer, not a jobs page that refuses to render because a
 * dropdown could not be filled. The job list is the point of the screen.
 */
export class HttpDirectoryRepository implements DirectoryPort {
  public async load(signal?: AbortSignal): Promise<AppResult<Directory>> {
    const [customers, crew] = await Promise.all([
      apiRequest<readonly DirectoryEntry[]>('/api/directory/customers', { method: 'GET' }, signal),
      apiRequest<readonly DirectoryEntry[]>('/api/directory/crew', { method: 'GET' }, signal),
    ]);

    return ok({
      customers: customers.ok ? customers.value : [],
      crew: crew.ok ? crew.value : [],
    });
  }
}
