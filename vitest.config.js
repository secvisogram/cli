import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/**/*.test.js'],
    // These tests spawn the CLI as a real child process per test case
    // (bin/cli.js runs top-level code and calls process.exit, so it can't
    // be unit-tested via import), which is slower than in-process tests.
    // This also means v8 code coverage can't attribute anything to
    // bin/cli.js itself (it only instruments the process vitest runs in,
    // not the spawned child processes) - there is intentionally no
    // coverage script for this package; see html-template for coverage of
    // the actual rendering logic this CLI is a thin wrapper around.
    testTimeout: 15000,
  },
})
