/**
 * @file studioAgentGrounding.test.ts
 * @description Regression tests for FinOps Copilot grounding (FIN-02).
 *
 * The model must receive the live project snapshot, not demo constants, and
 * tool results must be returned to the model for a grounded final answer.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import app from '../index.js';
import * as dbModule from '../db/database.js';
import { APEX_PROJECT_ID } from '../services/projectBootstrapService.js';

const openaiCreate = vi.hoisted(() => vi.fn());

vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = {
      completions: {
        create: openaiCreate,
      },
    };
  },
}));

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCHEMA_PATH = resolve(__dirname, '../db/schema.sql');

describe('Studio Agent Copilot grounding (FIN-02)', () => {
  let testDb: Database.Database;

  beforeEach(async () => {
    testDb = new Database(':memory:');
    testDb.exec(readFileSync(SCHEMA_PATH, 'utf-8'));
    dbModule.setDbForTesting(testDb);
    openaiCreate.mockReset();

    await request(app)
      .post('/api/projects/bootstrap')
      .send({ skipPayPal: true, skipChannel3: true });
  });

  afterEach(() => {
    dbModule.setDbForTesting(null);
    testDb.close();
    vi.restoreAllMocks();
  });

  it('uses the live project snapshot and grounds the final answer in tool results', async () => {
    openaiCreate
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [
                {
                  id: 'call_blast',
                  type: 'function',
                  function: { name: 'inspectBlastRadius', arguments: '{}' },
                },
              ],
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Grounded: the live snapshot has been evaluated.',
            },
          },
        ],
      });

    const res = await request(app).post('/api/studio-agent/chat').send({
      message: 'What is our exposure?',
      projectId: APEX_PROJECT_ID,
    });

    expect(res.status).toBe(200);
    expect(res.body.content).toBe('Grounded: the live snapshot has been evaluated.');
    expect(openaiCreate).toHaveBeenCalledTimes(2);

    const firstMessages = openaiCreate.mock.calls[0]![0]!.messages as Array<{
      role: string;
      content: string;
    }>;
    const systemPrompt = firstMessages[0]?.content ?? '';
    expect(systemPrompt).toContain('Authoritative project snapshot');
    expect(systemPrompt).toContain(APEX_PROJECT_ID);
    expect(systemPrompt).toContain('task_phase_2_displays');
    expect(systemPrompt).not.toContain('$2,800.00 idle exposure');
    expect(systemPrompt).not.toContain('refreshChannel3Quotes');

    const secondMessages = openaiCreate.mock.calls[1]![0]!.messages as Array<{
      role: string;
      tool_call_id?: string;
      content: string;
    }>;
    const toolMessage = secondMessages.find((message) => message.role === 'tool');
    expect(toolMessage).toBeDefined();
    expect(toolMessage?.tool_call_id).toBe('call_blast');
    expect(toolMessage?.content).toContain('total_exposure_minor');
  });

  it('rejects a scenario tool call that targets a task outside the project', async () => {
    openaiCreate
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [
                {
                  id: 'call_scenario',
                  type: 'function',
                  function: {
                    name: 'triggerScenario',
                    arguments: JSON.stringify({
                      scenarioId: 'SCENARIO_A',
                      targetTaskId: 'not-a-task',
                    }),
                  },
                },
              ],
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'That task is not part of this project.',
            },
          },
        ],
      });

    const res = await request(app).post('/api/studio-agent/chat').send({
      message: 'Run scenario A on not-a-task',
      projectId: APEX_PROJECT_ID,
    });

    expect(res.status).toBe(200);
    expect(res.body.content).toBe('That task is not part of this project.');

    const secondMessages = openaiCreate.mock.calls[1]![0]!.messages as Array<{
      role: string;
      content: string;
    }>;
    const toolMessage = secondMessages.find((message) => message.role === 'tool');
    expect(toolMessage?.content).toContain('does not belong');
  });
});
