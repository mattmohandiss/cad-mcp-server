import { defineConfig } from 'vitest/config';

// Native integration tests only: they need a configured sidecar or solver
// toolchain and run through `just test-integration`.
export default defineConfig({
  test: {
    include: ['tests/**/*.integration.test.ts'],
    exclude: ['node_modules/**', 'dist/**', '.direnv/**'],
  },
});
