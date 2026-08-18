import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end configuration.
 *
 * The suite runs against a real Next.js server talking to a real .NET API talking
 * to a real PostgreSQL. Nothing is stubbed — the point of an E2E test is to
 * exercise the integration that unit tests deliberately mock away, and a suite
 * with a mocked backend proves only that the mocks agree with each other.
 */

/** Where the app is served. Overridable so CI can point at a deployed preview. */
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

/**
 * The environment ships a pre-installed Chromium that may not match the revision
 * this Playwright version expects. When `PLAYWRIGHT_CHROMIUM_EXECUTABLE` is set,
 * that binary is used instead of the downloaded one; when it is not, Playwright
 * behaves normally. Set in CI, unset on a developer's machine.
 */
const chromiumExecutable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',

  // A test that only passes when run alone is a test that will fail in CI.
  fullyParallel: true,

  // `test.only` left in a commit fails the CI run instead of silently skipping
  // the rest of the suite.
  forbidOnly: Boolean(process.env.CI),

  // One retry in CI, none locally. Retries hide flakiness from the developer who
  // introduced it while keeping a genuinely flaky infrastructure blip from
  // failing a build — but a test that needs a retry locally is a test to fix.
  retries: process.env.CI ? 1 : 0,

  // Serialised in CI: the suite shares one database, and parallel workers would
  // see each other's jobs in the list. Spread conditionally rather than set to
  // `undefined`, which `exactOptionalPropertyTypes` correctly rejects — an
  // explicit `undefined` is not the same as an absent property.
  ...(process.env.CI ? { workers: 1 } : {}),

  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL,

    // Diagnostics on failure only. Capturing them always makes every run slow and
    // fills the artefact store with recordings of tests that passed.
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry',

    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },

  expect: {
    // Generous enough to absorb the async pipeline (a completion has to reach the
    // outbox and be reflected on refresh), tight enough that a genuine hang fails
    // rather than stalling the suite.
    timeout: 15_000,
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(chromiumExecutable === undefined
          ? {}
          : { launchOptions: { executablePath: chromiumExecutable } }),
      },
    },
  ],

  // Only started when the caller has not already provided a server. Locally that
  // means `npm run test:e2e` just works; in CI, where the stack is brought up by
  // Docker Compose, `E2E_BASE_URL` is set and this is skipped.
  ...(process.env.E2E_BASE_URL === undefined
    ? {
        webServer: {
          command: 'npm run start',
          url: baseURL,
          reuseExistingServer: true,
          timeout: 120_000,
        },
      }
    : {}),
});
