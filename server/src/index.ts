/**
 * @file index.ts
 * @description CascadeOS Express server entry point.
 *
 * Phase 1: Skeleton only — database init + health check.
 * Full route wiring added in Phase 5 (TASK-024).
 */

import express from 'express';
import cors from 'cors';
import { initDatabase } from './db/database.js';
import { env } from './config/env.js';

const app = express();

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use(cors());
app.use(express.json());

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
async function start(): Promise<void> {
  await initDatabase();

  app.listen(env.PORT, () => {
    console.log(`🚀  CascadeOS server running on port ${env.PORT} [${env.NODE_ENV}]`);
    console.log(`📦  Database: ${env.DATABASE_PATH}`);
  });
}

start().catch((err: unknown) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
