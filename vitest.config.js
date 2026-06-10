import { defineConfig } from 'vitest/config';

// Tests run against a dedicated local database (brevis_test) — NEVER the dev or
// production DB. vitest sets these env vars before any module loads; dotenv
// does not override pre-existing keys, so .env values cannot leak in for the
// keys listed here.
export default defineConfig({
    test: {
        environment: 'node',
        // All test files share one Postgres database and truncate between files,
        // so they must run sequentially.
        fileParallelism: false,
        setupFiles: ['./tests/setup.js'],
        include: ['tests/**/*.test.js', 'lib/**/*.test.js'],
        hookTimeout: 30000,
        testTimeout: 30000,
        env: {
            NODE_ENV: 'test',
            DATABASE_URL: 'postgresql://localhost:5432/brevis_test',
            JWT_SECRET: 'test-jwt-secret-not-for-production',
            EMAIL_WEBHOOK_SECRET: 'test-webhook-secret',
            // Dummy key so no code path can ever hit the real Anthropic API
            // with the developer's key during tests.
            ANTHROPIC_API_KEY: 'test-anthropic-key-invalid',
            FRONTEND_URL: 'http://localhost:3000',
            EMAIL_DOMAIN: 'test.brevisapp.com',
        },
    },
});
