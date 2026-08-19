import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    include: ['test/**/*.test.js'],
    setupFiles: ['test/setup.js'],
    // The retry tests drive the backoff through a fake clock, but the launcher
    // tests spawn a real node process and the lock tests wait on real timers,
    // so the 5s default is too tight on coverage-instrumented CI.
    testTimeout: 30000,
    hookTimeout: 30000,
    coverage: {
      include: ['src/**/*.js'],
      exclude: ['src/hooks/**'],
      reporter: ['text', 'lcov'],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
})
