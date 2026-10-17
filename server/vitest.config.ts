import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    reporters: ['verbose'],
    env: {
      NODE_ENV: 'test',
      PAYPAL_CLIENT_ID: 'sb-test-client-id-001',
      PAYPAL_CLIENT_SECRET: 'sb-test-client-secret-001',
      PAYPAL_API_BASE_URL: 'https://api-m.sandbox.paypal.com',
      CHANNEL3_API_KEY: 'test-channel3-key-001',
      OPENAI_API_KEY: 'test-openai-key-001',
    },
  },
});

