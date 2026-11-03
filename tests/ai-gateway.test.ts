import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import process from 'node:process';
import { callAi, AiFetch } from '../src/ai/gateway.js';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../src/sync/config.js';
import type { AuthSession } from '../src/sync/auth.js';

function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  Object.freeze(obj);
  for (const val of Object.values(obj)) {
    if (val !== null && typeof val === 'object') deepFreeze(val);
  }
  return obj;
}

const fakeSession: AuthSession = {
  access_token: 'fake-access-token-123',
  refresh_token: 'fake-refresh-token-456',
  expires_at: '2026-11-02T17:00:00.000Z',
};

describe('ELOS Milestone H1 - AI Gateway Foundation', () => {
  it('Gateway URL contract: callAi POSTs with correct headers, url, and body', async () => {
    let capturedUrl = '';
    let capturedInit: { method: string; headers: Record<string, string>; body?: string } | null = null;

    const fakeFetch: AiFetch = async (url, init) => {
      capturedUrl = url;
      capturedInit = init;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          task: 'ping',
          model: 'gemini-flash-latest',
          text: 'pong',
          used_today: 1,
          cap: 200,
        }),
      };
    };

    const outcome = await callAi(fakeFetch, fakeSession, 'ping', {});
    assert.strictEqual(outcome.status, 'ok');
    assert.strictEqual(capturedUrl, `${SUPABASE_URL}/functions/v1/ai-gateway`);
    assert.ok(capturedInit !== null);
    const init = capturedInit!;
    assert.strictEqual(init.method, 'POST');
    const headers = init.headers;
    assert.strictEqual(headers.apikey, SUPABASE_PUBLISHABLE_KEY);
    assert.strictEqual(headers.Authorization, 'Bearer fake-access-token-123');
    assert.strictEqual(headers['Content-Type'], 'application/json');
    assert.deepStrictEqual(JSON.parse(init.body as string), {
      task: 'ping',
      payload: {},
    });
  });

  it('not_signed_in: session null returns not_signed_in without calling fetch', async () => {
    let callCount = 0;
    const fakeFetch: AiFetch = async () => {
      callCount++;
      return { ok: true, status: 200, json: async () => ({}) };
    };

    const outcome = await callAi(fakeFetch, null, 'ping', {});
    assert.strictEqual(outcome.status, 'not_signed_in');
    assert.strictEqual(callCount, 0);
  });

  it('ok: parses successful gateway response', async () => {
    const fakeFetch: AiFetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        task: 'ping',
        model: 'gemini-flash-latest',
        text: 'pong',
        used_today: 3,
        cap: 200,
      }),
    });

    const outcome = await callAi(fakeFetch, fakeSession, 'ping', {});
    assert.deepStrictEqual(outcome, {
      status: 'ok',
      text: 'pong',
      model: 'gemini-flash-latest',
      callsToday: 3,
      cap: 200,
    });
  });

  it('code mapping: ai_disabled, daily_cap_reached, and generic error with message', async () => {
    const disabledFetch: AiFetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: false, code: 'ai_disabled' }),
    });
    const rDisabled = await callAi(disabledFetch, fakeSession, 'ping', {});
    assert.deepStrictEqual(rDisabled, { status: 'ai_disabled' });

    const capFetch: AiFetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: false, code: 'daily_cap_reached', used_today: 200, cap: 200 }),
    });
    const rCap = await callAi(capFetch, fakeSession, 'ping', {});
    assert.deepStrictEqual(rCap, { status: 'daily_cap_reached', usedToday: 200, cap: 200 });

    const errFetch: AiFetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: false, code: 'gemini_error', message: 'quota exceeded' }),
    });
    const rErr = await callAi(errFetch, fakeSession, 'ping', {});
    assert.strictEqual(rErr.status, 'error');
    if (rErr.status === 'error') {
      assert.ok(rErr.message.includes('gemini_error'));
      assert.ok(rErr.message.includes('quota'));
    }
  });

  it('HTTP 401 returns not_signed_in; HTTP 500 with unreadable body returns error', async () => {
    const unauthFetch: AiFetch = async () => ({
      ok: false,
      status: 401,
      json: async () => ({ ok: false, code: 'not_authenticated' }),
    });
    const rUnauth = await callAi(unauthFetch, fakeSession, 'ping', {});
    assert.strictEqual(rUnauth.status, 'not_signed_in');

    const err500Fetch: AiFetch = async () => ({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('invalid json');
      },
    });
    const r500 = await callAi(err500Fetch, fakeSession, 'ping', {});
    assert.strictEqual(r500.status, 'error');
  });

  it('throwing transport returns offline; bad json body returns bad_response error', async () => {
    const throwFetch: AiFetch = async () => {
      throw new Error('Connection refused');
    };
    const rOffline = await callAi(throwFetch, fakeSession, 'ping', {});
    assert.strictEqual(rOffline.status, 'offline');

    const badJsonFetch: AiFetch = async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('malformed');
      },
    });
    const rBadJson = await callAi(badJsonFetch, fakeSession, 'ping', {});
    assert.deepStrictEqual(rBadJson, { status: 'error', message: 'bad_response' });
  });

  it('immutability: deep-frozen session object passes through callAi unchanged', async () => {
    const frozen = deepFreeze({ ...fakeSession });
    const initialClone = JSON.parse(JSON.stringify(frozen));

    const fakeFetch: AiFetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, task: 'ping', model: 'm', text: 'pong', used_today: 1, cap: 200 }),
    });

    await callAi(fakeFetch, frozen, 'ping', {});
    await callAi(fakeFetch, null, 'ping', {});
    assert.deepStrictEqual(frozen, initialClone);
  });

  it('secret scan: no file under src/, supabase/functions/ or docs/ contains Google API key pattern', () => {
    const root = process.cwd();
    const keyPattern = /AIza[0-9A-Za-z_-]{20,}/;

    function scanDir(dir: string): void {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(full);
        } else if (entry.isFile()) {
          const content = fs.readFileSync(full, 'utf-8');
          assert.ok(
            !keyPattern.test(content),
            `Potential secret found in ${path.relative(root, full)} matching ${keyPattern}`
          );
        }
      }
    }

    scanDir(path.join(root, 'src'));
    scanDir(path.join(root, 'supabase', 'functions'));
    scanDir(path.join(root, 'docs'));
  });

  it('function file statics: index.ts contains expected tokens and no literal key', () => {
    const fnPath = path.join(process.cwd(), 'supabase', 'functions', 'ai-gateway', 'index.ts');
    assert.ok(fs.existsSync(fnPath), 'Function file exists');
    const content = fs.readFileSync(fnPath, 'utf-8');
    assert.ok(content.includes("Deno.env.get('GEMINI_API_KEY')"));
    assert.ok(content.includes('ALLOWED_TASKS'));
    assert.ok(content.includes("'ping'"));
    assert.ok(content.includes('daily_cap_reached'));
    assert.ok(content.includes('ai_calls'));
  });

  it('migration statics: 0002_ai_ledger.sql defines ai_calls, RLS, and revokes write', () => {
    const migPath = path.join(process.cwd(), 'supabase', 'migrations', '0002_ai_ledger.sql');
    assert.ok(fs.existsSync(migPath), 'Migration file exists');
    const content = fs.readFileSync(migPath, 'utf-8');
    assert.ok(content.includes('ai_calls'));
    assert.ok(content.includes('enable row level security'));
    assert.ok(content.includes('revoke insert, update, delete on public.ai_calls from anon, authenticated;'));
  });

  it('docs statics: docs/ai-gateway-setup.md exists and mentions GEMINI_API_KEY and Verify JWT', () => {
    const docPath = path.join(process.cwd(), 'docs', 'ai-gateway-setup.md');
    assert.ok(fs.existsSync(docPath), 'Doc exists');
    const content = fs.readFileSync(docPath, 'utf-8');
    assert.ok(content.includes('GEMINI_API_KEY'));
    assert.ok(content.includes('Verify JWT'));
  });

  it('layering scan: src/app does not import from ai, src/ai does not import from ui', () => {
    const root = process.cwd();
    const appDir = path.join(root, 'src', 'app');
    for (const f of fs.readdirSync(appDir).filter((x) => x.endsWith('.ts'))) {
      const code = fs.readFileSync(path.join(appDir, f), 'utf-8');
      assert.ok(!/from\s+['"][^'"]*\/ai(\/|['"])/.test(code), `src/app/${f} must not import from ai`);
    }

    const aiDir = path.join(root, 'src', 'ai');
    for (const f of fs.readdirSync(aiDir).filter((x) => x.endsWith('.ts'))) {
      const code = fs.readFileSync(path.join(aiDir, f), 'utf-8');
      assert.ok(!/from\s+['"][^'"]*\/ui(\/|['"])/.test(code), `src/ai/${f} must not import from ui`);
    }
  });
});
