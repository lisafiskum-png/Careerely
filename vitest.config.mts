import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // Server modules import 'server-only'; allow them in tests.
    alias: { 'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)) },
  },
  test: {
    include: ['tests/**/*.test.ts', 'lib/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    // PGlite applies the full migration history in beforeAll hooks. On a busy
    // CI runner that setup can exceed Vitest's 10 s default even though the
    // individual database tests are healthy.
    hookTimeout: 30_000,
  },
})
