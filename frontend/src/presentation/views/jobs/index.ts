/**
 * Public API of the jobs view.
 *
 * `app/jobs/page.tsx` imports `JobsView` from here and nothing else. It has no
 * idea the view is built from three feature slices, a store and an orchestrating
 * hook — which is what allows all of that to be restructured without touching the
 * route.
 */
export { JobsClient as JobsView } from './components/organisms/jobs-client.component';
export { useJobsPage } from './hooks/use-jobs-page.hook';
export type { UseJobsPageResult } from './hooks/use-jobs-page.hook';
