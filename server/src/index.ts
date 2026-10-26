/**
 * @file index.ts
 * @description CascadeOS Express Server Entrypoint (TASK-024, ARC-004).
 *
 * Implements:
 * - CORS configuration allowing frontend Vite access
 * - Raw body buffer preservation on JSON parser for PayPal webhook HMAC verification (REQ-012)
 * - Routing table mounting:
 *   - /api (project, scenario, recovery, studio agent)
 *   - /api/webhooks (PayPal webhooks)
 * - Automatic SQLite database initialization on boot
 * - Clean global error handler
 * - Exported `app` for supertest integration testing
 */

import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import { initDatabase } from './db/database.js';
import { env } from './config/env.js';

import projectRouter from './routes/projectRoutes.js';
import scenarioRouter from './routes/scenarioRoutes.js';
import recoveryRouter from './routes/recoveryRoutes.js';
import studioAgentRouter from './routes/studioAgentRoutes.js';
import webhookRouter from './routes/webhookRoutes.js';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

export const app = express();

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'PayPal-Request-Id', 'x-api-key'],
  })
);

// Preserve raw body buffer for PayPal webhook signature calculation (REQ-012, SEC-008)
app.use(
  express.json({
    verify: (req: Request & { rawBody?: Buffer }, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

// ---------------------------------------------------------------------------
// Route Mounting (ARC-004)
// ---------------------------------------------------------------------------

// Projects & Health (GET /api/health, POST /api/projects/bootstrap, GET /api/projects/:projectId/state)
app.use('/api', projectRouter);

// Scenario Triggers (POST /api/scenarios/:scenarioId/trigger)
app.use('/api', scenarioRouter);

// Recovery Plans & PayPal Orders (POST /api/recovery-plans/..., POST /api/paypal/orders/...)
app.use('/api', recoveryRouter);

// AG Studio Agent Chat (POST /api/studio-agent/chat)
app.use('/api', studioAgentRouter);

// PayPal Webhooks (POST /api/webhooks/paypal)
app.use('/api/webhooks', webhookRouter);

// ---------------------------------------------------------------------------
// Static Client Serving in Production
// ---------------------------------------------------------------------------

function resolveClientDistPath(): string | null {
  const candidates = [
    resolve(process.cwd(), 'client/dist'),
    resolve(process.cwd(), '../client/dist'),
    resolve(dirname(fileURLToPath(import.meta.url)), '../../client/dist'),
    resolve(dirname(fileURLToPath(import.meta.url)), '../../../client/dist'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return c;
    }
  }
  return null;
}

const clientDistPath = resolveClientDistPath();
if (clientDistPath) {
  app.use(express.static(clientDistPath));
  app.get('*', (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(resolve(clientDistPath, 'index.html'));
  });
}

// ---------------------------------------------------------------------------
// 404 Handler
// ---------------------------------------------------------------------------

app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: `Endpoint not found: ${req.method} ${req.originalUrl}`,
  });
});

// ---------------------------------------------------------------------------
// Global Error Handler
// ---------------------------------------------------------------------------

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[ServerError]', err);
  const message = err instanceof Error ? err.message : String(err);
  res.status(500).json({
    error: 'Internal server error',
    message,
  });
});

// ---------------------------------------------------------------------------
// Server Startup
// ---------------------------------------------------------------------------

export async function startServer(): Promise<void> {
  await initDatabase();

  const server = app.listen(env.PORT, () => {
    console.log(`🚀  CascadeOS Server running on http://localhost:${env.PORT} [${env.NODE_ENV}]`);
    console.log(`📦  Database: ${env.DATABASE_PATH}`);
    console.log(`🤖  LLM Provider: ${env.IS_GROQ ? 'Groq (openai/gpt-oss-120b)' : 'OpenAI (' + env.OPENAI_MODEL + ')'}`);
    console.log(`💳  PayPal Sandbox: ${env.PAYPAL_API_BASE_URL}`);
    console.log(`🛒  Channel3 API: ${env.CHANNEL3_API_BASE_URL}`);
  });

  return new Promise((resolve) => {
    server.on('listening', resolve);
  });
}

// Start automatically if executed directly (not when imported by tests)
if (process.env.NODE_ENV !== 'test' && import.meta.url === `file://${process.argv[1]}`) {
  startServer().catch((err: unknown) => {
    console.error('Fatal startup error:', err);
    process.exit(1);
  });
}

export default app;
