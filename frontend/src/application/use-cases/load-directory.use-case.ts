import type { AppResult } from '@/domain/errors';
import type { Directory, DirectoryPort } from '@/application/ports/directory.port';

/**
 * Loads the options the create-job form offers.
 *
 * Thin on purpose — there is no rule to apply to a list of names. It exists so
 * the Server Component asks the container for a use case, exactly as it does for
 * the job search, rather than reaching for an adapter directly. The day the
 * directory needs filtering by organisation or sorting by recent use, this is
 * where it goes, and no caller changes.
 */
export class LoadDirectoryUseCase {
  public constructor(private readonly directory: DirectoryPort) {}

  public execute(signal?: AbortSignal): Promise<AppResult<Directory>> {
    return this.directory.load(signal);
  }
}
