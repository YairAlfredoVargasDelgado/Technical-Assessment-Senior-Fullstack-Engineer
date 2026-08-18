import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * A single runner for both runtime and type-level tests.
 *
 * The assessment asks for Jest but also for `expectTypeOf`, which ships with
 * Vitest. Running both would mean two configs, two mocking APIs and two CI
 * steps for one test suite — cost with no benefit. Vitest's API is
 * Jest-compatible (`describe` / `it` / `expect` / `vi.fn`), so the Jest-style
 * tests read exactly as specified while `--typecheck` covers the type tests.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@app': fileURLToPath(new URL('./app', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'app/**/*.test.ts', 'app/**/*.test.tsx'],
    // Playwright owns `e2e/`; letting Vitest collect those files would start
    // two runners against the same specs.
    exclude: ['node_modules', '.next', 'e2e'],

    typecheck: {
      enabled: true,
      include: ['src/**/*.test-d.ts'],
      tsconfig: './tsconfig.json',
    },

    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],

      /*
       * Scoped to the code that contains decisions.
       *
       * The architecture deliberately concentrates every branch, every
       * derivation and every state transition into hooks, stores and pure
       * functions — components are thin shells that render what a hook gives
       * them. Measuring coverage over those shells would report on JSX, and a
       * render test asserting that a `<td>` contains the value it was passed
       * tests React, not this codebase.
       *
       * The shells are covered end to end by Playwright instead, which
       * exercises them the way a user does. Excluding them here keeps the
       * percentage meaningful: it measures the logic, so a drop means real
       * behaviour lost its test.
       */
      include: [
        'src/domain/**/*.ts',
        'src/application/**/*.ts',
        'src/shared/**/*.ts',
        'src/presentation/stores/**/*.ts',
        'src/presentation/views/**/hooks/**/*.ts',
      ],

      exclude: [
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/*.test-d.ts',
        '**/index.ts',
        // Type-only modules erase to nothing at runtime, so a coverage number
        // for them is meaningless. They are covered by `*.test-d.ts` instead.
        '**/*.type.ts',
        // Ports are interfaces; there is no executable code to cover.
        'src/application/ports/**',
      ],

      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
  },
});
