import type { AppResult } from '@/domain/errors';

/**
 * A selectable person or organisation the Jobs context refers to but does not own.
 *
 * Deliberately just an identifier and a label. The Jobs module stores the id and
 * nothing else, so anything richer here would be data the application layer
 * carries around and never uses.
 */
export interface DirectoryEntry {
  readonly id: string;
  readonly name: string;
}

/** Both lists the create-job form needs, so one render costs one round trip pair. */
export interface Directory {
  readonly customers: readonly DirectoryEntry[];
  readonly crew: readonly DirectoryEntry[];
}

/**
 * Where the pickers' options come from.
 *
 * Separate from `JobRepositoryPort` because it answers a different question. A
 * port that grew a `listCustomers` alongside `create` and `cancel` would be two
 * responsibilities in one interface, and every fake in every test would have to
 * stub methods it does not care about.
 */
export interface DirectoryPort {
  load(signal?: AbortSignal): Promise<AppResult<Directory>>;
}
