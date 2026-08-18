import 'server-only';

import { z } from 'zod';

/**
 * Server-side configuration, validated at first use.
 *
 * ## Why `server-only`
 *
 * This module reads secrets. The `server-only` package makes importing it from a
 * Client Component a **build error** rather than a runtime surprise — Next.js
 * would otherwise happily bundle it into the browser chunk and ship whatever it
 * closes over. It is the difference between a convention and a guarantee.
 *
 * ## Why parse rather than read
 *
 * `process.env.API_BASE_URL!` fails at the first request with
 * "Failed to parse URL from undefined", pointing at the fetch call rather than at
 * the missing variable. Parsing names the variable and the reason.
 */
const serverEnvSchema = z.object({
  /**
   * Where the API lives from the server's perspective.
   *
   * The default is the port `dotnet run` actually serves on — the one in the
   * API's launchSettings.json — so `dotnet run` and `npm run dev` talk to each
   * other with nothing configured. Compose overrides it with the service name.
   *
   * Deliberately not 5000: that is the historical ASP.NET default, but macOS
   * binds it to the AirPlay receiver, which is why .NET stopped using it.
   */
  API_BASE_URL: z.string().url().default('http://localhost:5106'),

  /**
   * Development tenant and user.
   *
   * Stand-ins for a real session. See `token-provider.ts` for what replaces them.
   */
  DEV_ORGANIZATION_ID: z.string().uuid().default('11111111-1111-1111-1111-111111111111'),
  DEV_USER_ID: z.string().uuid().default('22222222-2222-2222-2222-222222222222'),

  /** How long a server-side fetch may take before being abandoned. */
  API_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | null = null;

/**
 * Parsed configuration.
 *
 * Lazy and memoised rather than parsed at module load: `next build` imports every
 * module to collect metadata, and a top-level parse would fail the build on a
 * machine that has no runtime environment configured.
 */
export function serverEnv(): ServerEnv {
  if (cached !== null) {
    return cached;
  }

  const parsed = serverEnvSchema.safeParse(process.env);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');

    throw new Error(`Invalid server environment configuration — ${details}`);
  }

  cached = parsed.data;
  return cached;
}
