import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import process from 'node:process';
import { explainUnit } from '../src/ai/explain.js';
import type { AiFetch } from '../src/ai/gateway.js';
import type { AuthSession } from '../src/sync/auth.js';
import type { CurriculumUnitDef } from '../src/content/types.js';

const fakeSession: AuthSession = {
  access_token: 'fake-access-token-123',
  refresh_token: 'fake-refresh-token-456',
  expires_at: '2026-11-04T17:00:00.000Z',
};

const unit: CurriculumUnitDef = {
  id: 'grammar:present-simple-s',
  title: 'Present simple: he/she/it + -s',
  cefr: 'A1',
  prerequisites: [],
  summary_en: 'With he, she, it (and singular nouns) add -s or -es to the verb.',
  summary_ar: 'مع he وshe وit نضيف s أو es للفعل.',
  examples: ['She drinks tea every morning.'],
  common_mistake_ar: 'الخطأ الشائع: نسيان s مع المفرد (He go).',
};

function captureFetch(response: unknown): { fetchImpl: AiFetch; bodies: Array<Record<string, unknown>> } {
  const bodies: Array<Record<string, unknown>> = [];
  const fetchImpl: AiFetch = async (_url, init) => {
    bodies.push(JSON.parse(init.body ?? '{}') as Record<string, unknown>);
    return {
      ok: true,
      status: 200,
      json: async () => response,
    };
  };
  return { fetchImpl, bodies };
}

describe('ELOS Milestone H2 - explain_unit client wrapper', () => {
  it('sends task explain_unit with unit_id and the public unit content only', async () => {
    const { fetchImpl, bodies } = captureFetch({
      ok: true,
      task: 'explain_unit',
      model: 'gemini-flash-latest',
      text: 'الفكرة: نضيف s مع he/she/it.',
      used_today: 2,
      cap: 200,
    });

    const outcome = await explainUnit(fetchImpl, fakeSession, unit);
    assert.strictEqual(outcome.status, 'ok');
    assert.strictEqual(bodies.length, 1);

    const sent = bodies[0] as {
      task: string;
      payload: { unit_id: string; unit: Record<string, unknown> };
    };
    assert.strictEqual(sent.task, 'explain_unit');
    assert.strictEqual(sent.payload.unit_id, 'grammar:present-simple-s');
    assert.deepStrictEqual(
      Object.keys(sent.payload).sort(),
      ['unit', 'unit_id'],
      'payload carries only unit_id and unit'
    );
    assert.deepStrictEqual(
      Object.keys(sent.payload.unit).sort(),
      ['cefr', 'common_mistake_ar', 'examples', 'summary_ar', 'summary_en', 'title'],
      'unit content is limited to the public curriculum fields'
    );
  });

  it('not signed in: returns not_signed_in without calling fetch', async () => {
    let callCount = 0;
    const fetchImpl: AiFetch = async () => {
      callCount++;
      return { ok: true, status: 200, json: async () => ({}) };
    };

    const outcome = await explainUnit(fetchImpl, null, unit);
    assert.strictEqual(outcome.status, 'not_signed_in');
    assert.strictEqual(callCount, 0);
  });

  it('maps gateway failures: bad_task (redeploy needed) and bad_output (invalid AI reply)', async () => {
    const badTask = captureFetch({ ok: false, code: 'bad_task' });
    const r1 = await explainUnit(badTask.fetchImpl, fakeSession, unit);
    assert.deepStrictEqual(r1, { status: 'error', message: 'bad_task' });

    const badOut = captureFetch({ ok: false, code: 'bad_output' });
    const r2 = await explainUnit(badOut.fetchImpl, fakeSession, unit);
    assert.deepStrictEqual(r2, { status: 'error', message: 'bad_output' });
  });

  it('server statics: function validates explain_unit deterministically with the Arabic scaffold', () => {
    const fnPath = path.join(process.cwd(), 'supabase', 'functions', 'ai-gateway', 'index.ts');
    const content = fs.readFileSync(fnPath, 'utf-8');
    assert.ok(content.includes("'explain_unit'"), 'explain_unit is an allowed task');
    assert.ok(content.includes('validateExplainPayload'), 'payload validation exists');
    assert.ok(content.includes('bad_payload'), 'invalid payload code exists');
    assert.ok(content.includes('buildExplainPrompt'), 'scaffold prompt builder exists');
    assert.ok(content.includes('الفكرة'), 'Arabic scaffold section label present');
    assert.ok(content.includes('isValidExplanation'), 'output gate exists');
    assert.ok(content.includes('bad_output'), 'invalid output code exists');
    assert.ok(content.includes('\\u0600-\\u06FF'), 'Arabic-script check present');
    assert.ok(content.includes('GEMINI_API_KEY'), 'key still read from env only');
    assert.ok(content.includes('GEMINI_TIMEOUT_MS'), 'bounded Gemini call exists');
    assert.ok(content.includes("=== 503 || geminiRes.status === 429"), 'one retry on transient overload');
    assert.ok(content.includes("'timeout'"), 'timeout error code exists');
  });

  it('UI wiring statics: unitCard exposes the explain button and main wires explainUnit', () => {
    const cardPath = path.join(process.cwd(), 'src', 'ui', 'screens', 'unitCard.ts');
    const card = fs.readFileSync(cardPath, 'utf-8');
    assert.ok(card.includes('Explain with AI (Arabic)'), 'button label present');
    assert.ok(card.includes('showExplainOutcome'), 'outcome mapping present');
    assert.ok(card.includes('createRtlBlock(outcome.text)'), 'Arabic text renders in an RTL block');

    const mainPath = path.join(process.cwd(), 'src', 'ui', 'main.ts');
    const main = fs.readFileSync(mainPath, 'utf-8');
    assert.ok(
      main.includes('explainUnit(fetch, currentAuth, unitDef)'),
      'main wires the explain wrapper into the unit card'
    );
  });
});
