/**
 * Public API of the `create-job` slice.
 *
 * Everything outside this folder imports from here and never reaches into
 * `hooks/` or `components/` directly. That is what makes the slice's internals
 * genuinely internal: files can be renamed, split or replaced without a single
 * edit outside this directory.
 *
 * Note what is NOT exported: the reducer and the validator are internal to the
 * slice. They are reached in tests through a relative import within the slice,
 * which is allowed — the barrel governs what *other* slices may see.
 */
export { CreateJobModal } from './components/organisms/create-job-modal.component';
export { useCreateJob } from './hooks/use-create-job.hook';
export type {
  CreateJobField,
  CreateJobFormValues,
  CreateJobMode,
  UseCreateJobResult,
} from './hooks/use-create-job.hook';
