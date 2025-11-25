import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: [
        'config/**/*.js',
        'services/**/*.js',
        'tools/**/*.js',
        'utils/**/*.js'
      ],
      exclude: [
        'node_modules/**',
        'tests/**',
        'bin/**',
        '*.config.js'
      ],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 50,
        statements: 60
      }
    },
    testTimeout: 30000,
    hookTimeout: 10000
  }
});
