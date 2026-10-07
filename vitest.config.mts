import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // Server modules import 'server-only'; allow them in tests.
    alias: { 'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)) },
  },
  test: {
    environment: 'node',
    testTimeout: 30_000,
    // PGlite applies the full migration history in beforeAll hooks. On a busy
    // CI runner that setup can exceed Vitest's 10 s default even though the
    // individual database tests are healthy.
    hookTimeout: 30_000,
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['tests/**/*.test.ts', 'lib/**/*.test.ts'], exclude: ['tests/integration/**'] },
      },
      {
        // These share one local Supabase database and its job queue, so they
        // run one file at a time (in parallel they claim each other's tasks).
        // Each skips itself when the local stack isn't running.
        extends: true,
        test: { name: 'integration', include: ['tests/integration/**/*.test.ts'], fileParallelism: false },
      },
    ],
  },
})
