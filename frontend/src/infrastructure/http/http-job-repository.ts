import 'server-only';

import type { Job, JobPage } from '@/domain/entities/job/job.entity';
import type { AppResult } from '@/domain/errors';
import type {
  CancelJobInput,
  CompleteJobInput,
  CreateJobInput,
  JobRepositoryPort,
  JobSearchQuery,
} from '@/application/ports/job-repository.port';

import { apiRequest } from './api-client';

/**
 * Talks to the JobTracker API over HTTP.
 *
 * ## The only class that knows the API exists
 *
 * Above it, use cases depend on `JobRepositoryPort`. Below it, nothing. Route
 * shapes, header names, the ProblemDetails envelope and the API's field naming
 * all stop here — which is what makes an API change a one-file change rather than
 * a search across the presentation layer.
 *
 * ## Errors are returned, never thrown
 *
 * Every method returns `AppResult`. A 409 from a rejected state transition is an
 * ordinary outcome the UI must render, not an exception; and because these calls
 * are made from Server Actions, a thrown error would reach the browser as a
 * redacted generic message in production and the form would have nothing to show.
 */
export class HttpJobRepository implements JobRepositoryPort {
  public async search(query: JobSearchQuery = {}, signal?: AbortSignal): Promise<AppResult<JobPage>> {
    const params = new URLSearchParams();
    const { filters, cursor, limit } = query;

    if (filters?.searchTerm) {
      params.set('searchTerm', filters.searchTerm);
    }

    // Repeated key rather than a comma-joined list: ASP.NET Core binds
    // `?status=A&status=B` to an array natively, and a joined string would need
    // a custom binder on the other side.
    for (const status of filters?.statuses ?? []) {
      params.append('status', status);
    }

    if (filters?.scheduledFrom) {
      params.set('scheduledFrom', filters.scheduledFrom);
    }

    if (filters?.scheduledTo) {
      params.set('scheduledTo', filters.scheduledTo);
    }

    if (filters?.assigneeId) {
      params.set('assigneeId', filters.assigneeId);
    }

    if (cursor) {
      params.set('cursor', cursor);
    }

    if (limit !== undefined) {
      params.set('limit', String(limit));
    }

    const search = params.size > 0 ? `?${params.toString()}` : '';

    return apiRequest<JobPage>(`/api/jobs${search}`, { method: 'GET' }, signal);
  }

  public async getById(jobId: string, signal?: AbortSignal): Promise<AppResult<Job>> {
    return apiRequest<Job>(`/api/jobs/${encodeURIComponent(jobId)}`, { method: 'GET' }, signal);
  }

  public async create(input: CreateJobInput): Promise<AppResult<string>> {
    // The API takes the address flat while the application layer keeps it
    // composed. Flattening here — and only here — is what stops the wire format
    // dictating the shape of types above this class.
    const { address, ...rest } = input;

    return apiRequest<string>('/api/jobs', {
      method: 'POST',
      body: JSON.stringify({
        ...rest,
        street: address.street,
        city: address.city,
        state: address.state,
        zipCode: address.zipCode,
        latitude: address.latitude,
        longitude: address.longitude,
      }),
    });
  }

  public async start(jobId: string): Promise<AppResult<void>> {
    return apiRequest<void>(`/api/jobs/${encodeURIComponent(jobId)}/start`, { method: 'POST' });
  }

  public async complete({ jobId, signatureUrl }: CompleteJobInput): Promise<AppResult<void>> {
    return apiRequest<void>(`/api/jobs/${encodeURIComponent(jobId)}/complete`, {
      method: 'POST',
      body: JSON.stringify({ signatureUrl }),
    });
  }

  public async cancel({ jobId, reason }: CancelJobInput): Promise<AppResult<void>> {
    return apiRequest<void>(`/api/jobs/${encodeURIComponent(jobId)}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }
}

export type { Job };
