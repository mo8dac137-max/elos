import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '../src/sync/config.js';
import { AuthSession, ensureFreshSession, signIn, SignInError, SyncFetch, SyncResponse } from '../src/sync/auth.js';
import { runSync } from '../src/sync/sync.js';
import { createClient, unsyncedCount, activeEvents, EvidenceEvent } from '../src/kernel/index.js';
import { EXERCISE_BANK, submitAnswer } from '../src/app/index.js';

interface RecordedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

interface StoredServerEvent {
  server_seq: number;
  raw: EvidenceEvent;
  device_id: string;
  device_seq: number;
  received_at: string;
}

class FakeServer {
  calls: RecordedCall[] = [];
  events: StoredServerEvent[] = [];
  nextServerSeq = 1;
  pageSize: number | null = null;
  onPush?: (body: unknown) => { ok: boolean; status: number; data: unknown } | null;
  onPull?: (body: unknown) => { ok: boolean; status: number; data: unknown } | null;
  throwOnPush = false;

  fetch: SyncFetch = async (url, init): Promise<SyncResponse> => {
    let parsedBody: unknown;
    if (init.body) {
      try { parsedBody = JSON.parse(init.body); } catch { parsedBody = init.body; }
    }
    this.calls.push({ url, method: init.method, headers: init.headers, body: parsedBody });

    if (url.includes('/auth/v1/token?grant_type=password')) {
      const b = parsedBody as Record<string, string>;
      if (b.email === 'test@example.com' && b.password === 'pass123') {
        return { ok: true, status: 200, json: async () => ({ access_token: 'acc-123', refresh_token: 'ref-123', expires_in: 3600 }) };
      }
      return { ok: false, status: 400, json: async () => ({ error_code: 'invalid_credentials', msg: 'Invalid login credentials' }) };
    }

    if (url.includes('/auth/v1/token?grant_type=refresh_token')) {
      return { ok: true, status: 200, json: async () => ({ access_token: 'acc-refreshed', refresh_token: 'ref-refreshed', expires_in: 3600 }) };
    }

    if (url.includes('/rest/v1/rpc/register_device') || url.includes('/rest/v1/rpc/note_sync')) {
      return { ok: true, status: 200, json: async () => null };
    }

    if (url.includes('/rest/v1/rpc/sync_push')) {
      if (this.throwOnPush) throw new TypeError('Network error');
      if (this.onPush) {
        const c = this.onPush(parsedBody);
        if (c) return { ok: c.ok, status: c.status, json: async () => c.data };
      }

      const pEvents = (parsedBody as { p_events?: Array<{ event_id: string; device_id: string; device_seq: number; raw: EvidenceEvent }> })?.p_events || [];
      const accepted: Array<{ event_id: string; server_seq: number; received_at: string }> = [];
      const rejected: Array<{ event_id: string; reason: string }> = [];

      for (const item of pEvents) {
        const existing = this.events.find(e => e.raw.event_id === item.event_id);
        if (existing) {
          if (JSON.stringify(existing.raw) === JSON.stringify(item.raw)) {
            accepted.push({ event_id: item.event_id, server_seq: existing.server_seq, received_at: existing.received_at });
          } else {
            rejected.push({ event_id: item.event_id, reason: 'event_id_conflict' });
          }
        } else {
          const sSeq = this.nextServerSeq++;
          const recAt = new Date().toISOString();
          this.events.push({ server_seq: sSeq, raw: item.raw, device_id: item.device_id, device_seq: item.device_seq, received_at: recAt });
          accepted.push({ event_id: item.event_id, server_seq: sSeq, received_at: recAt });
        }
      }
      return { ok: true, status: 200, json: async () => ({ accepted, rejected, retryable: [] }) };
    }

    if (url.includes('/rest/v1/rpc/sync_pull')) {
      if (this.onPull) {
        const c = this.onPull(parsedBody);
        if (c) return { ok: c.ok, status: c.status, json: async () => c.data };
      }
      const pAfter = (parsedBody as { p_after?: number })?.p_after ?? 0;
      const filtered = this.events.filter(e => e.server_seq > pAfter).sort((a, b) => a.server_seq - b.server_seq);
      const limit = this.pageSize !== null ? this.pageSize : 200;
      const page = filtered.slice(0, limit);
      const nextCursor = page.length > 0 ? page[page.length - 1].server_seq : pAfter;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          events: page.map(e => ({ raw: e.raw, device_id: e.device_id, device_seq: e.device_seq, server_seq: e.server_seq, received_at: e.received_at })),
          next_cursor: nextCursor,
        }),
      };
    }
    return { ok: false, status: 404, json: async () => ({ error: 'Not found' }) };
  };
}

function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === 'object') {
    Object.freeze(obj);
    for (const key of Object.keys(obj)) deepFreeze((obj as Record<string, unknown>)[key]);
  }
  return obj;
}

function sampleEvent(id: string): EvidenceEvent {
  return {
    event_id: id,
    payload_type: 'item_response',
    payload_version: 1,
    payload: { item_id: 'r1', response: 'gone' },
    unit_refs: ['grammar:go-went-gone'],
    skill: 'grammar',
    modality: 'receptive_written',
    task_class: 'recognition_item',
    context_id: 'sample',
    evaluator: { type: 'deterministic', id: 'closed_item', version: '1' },
    reliability: 'usable',
    result: 'correct',
    occurred_at: new Date().toISOString(),
    recorded_at: new Date().toISOString(),
  };
}

describe('Milestone G2: Sync Driver & Auth Engine', () => {
  it('config: SUPABASE_URL and key match patterns; no secret in src/sync', () => {
    assert.ok(SUPABASE_URL.startsWith('https://'));
    assert.ok(SUPABASE_URL.endsWith('.supabase.co'));
    assert.ok(SUPABASE_PUBLISHABLE_KEY.startsWith('sb_publishable_'));
    const syncDir = path.resolve('src/sync');
    for (const f of fs.readdirSync(syncDir)) {
      const content = fs.readFileSync(path.join(syncDir, f), 'utf8');
      assert.ok(!/sb_secret/i.test(content), `Found secret in ${f}`);
    }
  });

  it('signIn: correct URL, headers, body, parsing, error_code on 400, and network code on throw', async () => {
    const server = new FakeServer();
    const beforeMs = Date.now();
    const session = await signIn(server.fetch, 'test@example.com', 'pass123');
    assert.strictEqual(session.access_token, 'acc-123');
    assert.strictEqual(session.refresh_token, 'ref-123');
    const expiresMs = Date.parse(session.expires_at);
    assert.ok(expiresMs >= beforeMs + 3590000 && expiresMs <= beforeMs + 3610000);

    const call = server.calls.find(c => c.url.includes('/auth/v1/token'));
    if (!call) throw new Error('Auth call not recorded');
    assert.ok(call.url.includes('grant_type=password'));
    assert.strictEqual(call.headers.apikey, SUPABASE_PUBLISHABLE_KEY);
    assert.deepStrictEqual(call.body, { email: 'test@example.com', password: 'pass123' });

    let err1: unknown = null;
    try {
      await signIn(server.fetch, 'wrong@example.com', 'bad');
    } catch (e) {
      err1 = e;
    }
    assert.ok(err1 instanceof SignInError && err1.code === 'invalid_credentials');

    let err2: unknown = null;
    const throwingFetch: SyncFetch = async () => { throw new TypeError('Network fail'); };
    try {
      await signIn(throwingFetch, 'test@example.com', 'pass123');
    } catch (e) {
      err2 = e;
    }
    assert.ok(err2 instanceof SignInError && err2.code === 'network');
  });

  it('ensureFreshSession: >60s left makes no call; expired refreshes; failing refresh keeps original', async () => {
    const server = new FakeServer();
    const futureSession: AuthSession = { access_token: 'valid', refresh_token: 'ref', expires_at: new Date(Date.now() + 120000).toISOString() };
    const s1 = await ensureFreshSession(server.fetch, futureSession);
    assert.strictEqual(s1, futureSession);
    assert.strictEqual(server.calls.length, 0);

    const expiredSession: AuthSession = { access_token: 'exp', refresh_token: 'ref', expires_at: new Date(Date.now() - 1000).toISOString() };
    const s2 = await ensureFreshSession(server.fetch, expiredSession);
    assert.strictEqual(s2.access_token, 'acc-refreshed');
    assert.strictEqual(s2.refresh_token, 'ref-refreshed');

    const failingFetch: SyncFetch = async () => { throw new Error('fail'); };
    const s3 = await ensureFreshSession(failingFetch, expiredSession);
    assert.strictEqual(s3, expiredSession);
  });

  it('runSync with session null: outcome not_signed_in, no calls, state unchanged', async () => {
    const server = new FakeServer();
    const client = createClient('dev-null-session');
    const res = await runSync(server.fetch, client, null);
    assert.strictEqual(res.outcome.status, 'not_signed_in');
    assert.strictEqual(server.calls.length, 0);
    assert.deepStrictEqual(res.state, client);
  });

  it('push happy path: 3 answers -> single sync_push call in device_seq order; registers device and notes sync', async () => {
    const server = new FakeServer();
    let client = createClient('dev-push-happy');
    const session: AuthSession = { access_token: 'tok', refresh_token: 'ref', expires_at: new Date(Date.now() + 3600000).toISOString() };

    let clock = 1000;
    const ctx = { now: () => new Date(clock++).toISOString(), newId: () => `ev-${clock}` };
    client = submitAnswer(client, EXERCISE_BANK[0], 'gone', ctx).state;
    client = submitAnswer(client, EXERCISE_BANK[1], 'went', ctx).state;
    client = submitAnswer(client, EXERCISE_BANK[2], 'gone', ctx).state;

    const res = await runSync(server.fetch, client, session);
    assert.strictEqual(res.outcome.status, 'ok');
    assert.strictEqual(res.outcome.pushed, 3);
    assert.strictEqual(unsyncedCount(res.state), 0);
    assert.deepStrictEqual(res.state.events.map(e => e.server_seq), [1, 2, 3]);

    const pushCall = server.calls.find(c => c.url.includes('/sync_push'));
    if (!pushCall) throw new Error('Push call not recorded');
    const pEvents = (pushCall.body as { p_events: Array<{ device_seq: number }> }).p_events;
    assert.strictEqual(pEvents.length, 3);
    assert.ok(pEvents[0].device_seq < pEvents[1].device_seq && pEvents[1].device_seq < pEvents[2].device_seq);

    assert.ok(server.calls.some(c => c.url.includes('/register_device') && (c.body as any)?.p_device_id === client.device_id));
    assert.ok(server.calls.some(c => c.url.includes('/note_sync') && (c.body as any)?.p_device_id === client.device_id));
  });

  it('idempotence: second runSync performs no sync_push call', async () => {
    const server = new FakeServer();
    let client = createClient('dev-idem');
    const session: AuthSession = { access_token: 'tok', refresh_token: 'ref', expires_at: new Date(Date.now() + 3600000).toISOString() };
    client = submitAnswer(client, EXERCISE_BANK[0], 'gone', { now: () => '2026-01-01T10:00:00Z', newId: () => 'ev-idem-1' }).state;

    const r1 = await runSync(server.fetch, client, session);
    assert.strictEqual(r1.outcome.pushed, 1);

    const callsCountBefore = server.calls.length;
    const r2 = await runSync(server.fetch, r1.state, session);
    const pushCalls = server.calls.slice(callsCountBefore).filter(c => c.url.includes('/sync_push'));
    assert.strictEqual(pushCalls.length, 0);
    assert.strictEqual(r2.outcome.pushed, 0);
  });

  it('error surfacing: { error: "not_authenticated" } gives status error and preserves outbox', async () => {
    const server = new FakeServer();
    server.onPush = () => ({ ok: true, status: 200, data: { error: 'not_authenticated' } });
    let client = createClient('dev-err');
    const session: AuthSession = { access_token: 'tok', refresh_token: 'ref', expires_at: new Date(Date.now() + 3600000).toISOString() };
    client = submitAnswer(client, EXERCISE_BANK[0], 'gone', { now: () => '2026-01-01T10:00:00Z', newId: () => 'ev-err-1' }).state;

    const res = await runSync(server.fetch, client, session);
    assert.strictEqual(res.outcome.status, 'error');
    assert.ok(res.outcome.message?.includes('not_authenticated'));
    assert.strictEqual(unsyncedCount(res.state), 1);
  });

  it('offline: throwing transport gives status offline; events remain unsynced', async () => {
    const server = new FakeServer();
    server.throwOnPush = true;
    let client = createClient('dev-offline');
    const session: AuthSession = { access_token: 'tok', refresh_token: 'ref', expires_at: new Date(Date.now() + 3600000).toISOString() };
    client = submitAnswer(client, EXERCISE_BANK[0], 'gone', { now: () => '2026-01-01T10:00:00Z', newId: () => 'ev-off-1' }).state;

    const res = await runSync(server.fetch, client, session);
    assert.strictEqual(res.outcome.status, 'offline');
    assert.strictEqual(unsyncedCount(res.state), 1);
  });

  it('pull: server holds 5 events -> pulled === 5, state contains them, cursor advanced to 5', async () => {
    const server = new FakeServer();
    for (let i = 1; i <= 5; i++) {
      server.events.push({ server_seq: i, raw: sampleEvent(`server-ev-${i}`), device_id: 'other', device_seq: i, received_at: new Date().toISOString() });
    }
    const client = createClient('dev-pull');
    const session: AuthSession = { access_token: 'tok', refresh_token: 'ref', expires_at: new Date(Date.now() + 3600000).toISOString() };

    const res = await runSync(server.fetch, client, session);
    assert.strictEqual(res.outcome.status, 'ok');
    assert.strictEqual(res.outcome.pulled, 5);
    assert.strictEqual(res.state.cursor, 5);
    const active = activeEvents(res.state);
    for (let i = 1; i <= 5; i++) assert.ok(active.some(e => e.event_id === `server-ev-${i}`));
  });

  it('pagination: server page size 2 with 5 events -> at least 3 sync_pull calls and cursor 5', async () => {
    const server = new FakeServer();
    server.pageSize = 2;
    for (let i = 1; i <= 5; i++) {
      server.events.push({ server_seq: i, raw: sampleEvent(`pag-ev-${i}`), device_id: 'other', device_seq: i, received_at: new Date().toISOString() });
    }
    const client = createClient('dev-pagination');
    const session: AuthSession = { access_token: 'tok', refresh_token: 'ref', expires_at: new Date(Date.now() + 3600000).toISOString() };

    const res = await runSync(server.fetch, client, session);
    assert.strictEqual(res.outcome.status, 'ok');
    assert.strictEqual(res.outcome.pulled, 5);
    assert.strictEqual(res.state.cursor, 5);
    const pullCalls = server.calls.filter(c => c.url.includes('/sync_pull'));
    assert.ok(pullCalls.length >= 3, `Expected at least 3 sync_pull calls, got ${pullCalls.length}`);
  });

  it('pull error body -> outcome error', async () => {
    const server = new FakeServer();
    server.onPull = () => ({ ok: true, status: 200, data: { error: 'pull_failed' } });
    const client = createClient('dev-pull-err');
    const session: AuthSession = { access_token: 'tok', refresh_token: 'ref', expires_at: new Date(Date.now() + 3600000).toISOString() };

    const res = await runSync(server.fetch, client, session);
    assert.strictEqual(res.outcome.status, 'error');
  });

  it('HTTP 401 from sync_push -> outcome error with 401 in message', async () => {
    const server = new FakeServer();
    server.onPush = () => ({ ok: false, status: 401, data: { message: 'Invalid JWT' } });
    let client = createClient('dev-401');
    const session: AuthSession = { access_token: 'tok', refresh_token: 'ref', expires_at: new Date(Date.now() + 3600000).toISOString() };
    client = submitAnswer(client, EXERCISE_BANK[0], 'gone', { now: () => '2026-01-01T10:00:00Z', newId: () => 'ev-401' }).state;

    const res = await runSync(server.fetch, client, session);
    assert.strictEqual(res.outcome.status, 'error');
    assert.ok(res.outcome.message?.includes('401'));
  });

  it('immutability: deep-freeze client state on not-signed-in path completes without throwing', async () => {
    const server = new FakeServer();
    const client = deepFreeze(createClient('dev-freeze'));
    const res = await runSync(server.fetch, client, null);
    assert.strictEqual(res.outcome.status, 'not_signed_in');
  });

  it('layering scan: src/sync does not import from ui, src/app does not import from sync', () => {
    const scanImports = (dir: string, forbidden: string[]) => {
      for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, f.name);
        if (f.isDirectory()) {
          scanImports(full, forbidden);
        } else if (f.name.endsWith('.ts')) {
          const content = fs.readFileSync(full, 'utf8');
          const regex = /import\s+.*?from\s+['"](.*?)['"]/g;
          let match: RegExpExecArray | null;
          while ((match = regex.exec(content)) !== null) {
            for (const forb of forbidden) {
              assert.ok(!match[1].includes(forb), `File ${full} imports forbidden path "${match[1]}"`);
            }
          }
        }
      }
    };
    scanImports(path.resolve('src/sync'), ['/ui', '../ui']);
    scanImports(path.resolve('src/app'), ['/sync', '../sync']);
  });
});
