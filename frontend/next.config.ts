import type { NextConfig } from 'next';

/**
 * `output: 'standalone'` is gated behind an environment variable.
 *
 * Standalone emits a self-contained server at `.next/standalone/server.js` with
 * only the reachable files — exactly what the Docker runtime stage should copy,
 * and a large image saving. But it is *incompatible with `next start`*: Next.js
 * warns and the resulting server misbehaves, which cost a debugging session here
 * when Server Action revalidation silently stopped propagating.
 *
 * So it is switched on only where it is wanted. The Dockerfile sets
 * `BUILD_STANDALONE=1`; a developer running `npm run build && npm start` gets the
 * normal server, and the E2E suite runs against the same thing they do.
 */
const isStandaloneBuild = process.env.BUILD_STANDALONE === '1';

const nextConfig: NextConfig = {
  reactStrictMode: true,

  ...(isStandaloneBuild ? { output: 'standalone' as const } : {}),

  // A failing type check or lint must fail the build. Next.js will otherwise
  // happily ship a build with type errors, which turns `strict: true` into a
  // suggestion.
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: false },

  // `instrumentation.ts` is picked up automatically in Next.js 15; this makes the
  // dependency explicit for anyone reading the config rather than the file tree.
  serverExternalPackages: ['@vercel/otel'],

  experimental: {
    // Barrel files re-export everything; without this, importing one symbol from
    // a barrel pulls the whole folder into the chunk.
    optimizePackageImports: ['zustand'],
  },
};

export default nextConfig;
