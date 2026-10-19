import { defineConfig } from 'vitest/config';

// Unit tests run by default. `*.integration.test.ts` need native toolchains
// (sidecar / solvers) and run only through `just test:integration`.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**', '.direnv/**', '**/*.integration.test.ts'],
  },
});
