import { defineConfig } from 'vitest/config';
import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load live .env from monorepo root
config({ path: resolve(__dirname, '../.env') });
config();

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    reporters: ['verbose'],
    testTimeout: 35000,
    hookTimeout: 35000,
    env: {
      NODE_ENV: 'test',
    },
  },
});
