import { AuthSession, ensureFreshSession, SyncFetch } from './auth.js';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './config.js';
import {
  ClientState,
  PushResponse,
  PullPage,
  prepareBatch,
  applyPushResponse,
  applyPull,
} from '../kernel/index.js';

export interface SyncOutcome {
  status: 'ok' | 'offline' | 'error' | 'not_signed_in';
  message?: string;
  pushed: number;
  pulled: number;
  last_synced_at: string | null;
}

class NetworkError extends Error {}

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

export async function runSync(
  fetchImpl: SyncFetch,
  state: ClientState,
  session: AuthSession | null
): Promise<{ state: ClientState; session: AuthSession | null; outcome: SyncOutcome }> {
  let pushed = 0;
  let pulled = 0;

  // 1. If session is null: return unchanged state, session, and not_signed_in outcome.
  if (session === null) {
    return {
      state,
      session: null,
      outcome: {
        status: 'not_signed_in',
        pushed: 0,
        pulled: 0,
        last_synced_at: null,
      },
    };
  }

  // 2. Refresh session if needed.
  let currentSession = await ensureFreshSession(fetchImpl, session);
  let currentState = state;

  // 3. rpc helper
  async function rpc(name: string, body: unknown): Promise<unknown> {
    const url = `${SUPABASE_URL}/rest/v1/rpc/${name}`;
    const headers: Record<string, string> = {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${currentSession.access_token}`,
      'Content-Type': 'application/json',
    };

    let res;
    try {
      res = await fetchImpl(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new NetworkError(err instanceof Error ? err.message : 'Network error');
    }

    if (!res.ok) {
      let errMsg = `HTTP ${res.status}`;
      try {
        const errJson = await res.json();
        if (errJson && typeof errJson === 'object') {
          const b = errJson as Record<string, unknown>;
          const detail = b.message || b.msg || b.error || b.error_description;
          if (typeof detail === 'string' && detail.trim() !== '') {
            errMsg = `HTTP ${res.status} ${detail}`;
          }
        }
      } catch {
        // Body unreadable
      }
      throw new HttpError(res.status, errMsg);
    }

    return await res.json();
  }

  try {
    // 4. Best-effort register device (failures ignored)
    try {
      await rpc('register_device', { p_device_id: currentState.device_id });
    } catch {
      // Ignored
    }

    // 5. PUSH loop, at most 100 batches
    for (let i = 0; i < 100; i++) {
      const batch = prepareBatch(currentState, 50);
      if (batch.length === 0) {
        break;
      }

      const wrappers = batch.map((s) => ({
        event_id: s.event.event_id,
        device_id: s.device_id,
        device_seq: s.device_seq,
        raw: s.event,
      }));

      const resBody = await rpc('sync_push', { p_events: wrappers });

      if (
        resBody &&
        typeof resBody === 'object' &&
        typeof (resBody as Record<string, unknown>).error === 'string'
      ) {
        const errorMsg = (resBody as Record<string, unknown>).error as string;
        return {
          state: currentState,
          session: currentSession,
          outcome: {
            status: 'error',
            message: 'server: ' + errorMsg,
            pushed,
            pulled,
            last_synced_at: null,
          },
        };
      }

      const pushBody = (resBody ?? {}) as PushResponse;
      const accepted = Array.isArray(pushBody.accepted) ? pushBody.accepted : [];
      const rejected = Array.isArray(pushBody.rejected) ? pushBody.rejected : [];
      const retryable = Array.isArray(pushBody.retryable) ? pushBody.retryable : [];

      currentState = applyPushResponse(currentState, { accepted, rejected, retryable });
      pushed += accepted.length;

      if (i === 99 && currentState.outbox.length > 0) {
        return {
          state: currentState,
          session: currentSession,
          outcome: {
            status: 'error',
            message: 'push batch limit reached',
            pushed,
            pulled,
            last_synced_at: null,
          },
        };
      }
    }

    // 6. PULL loop, at most 50 pages
    for (let j = 0; j < 50; j++) {
      const resBody = await rpc('sync_pull', {
        p_after: currentState.cursor,
        p_limit: 200,
      });

      if (
        resBody &&
        typeof resBody === 'object' &&
        typeof (resBody as Record<string, unknown>).error === 'string'
      ) {
        const errorMsg = (resBody as Record<string, unknown>).error as string;
        return {
          state: currentState,
          session: currentSession,
          outcome: {
            status: 'error',
            message: 'server: ' + errorMsg,
            pushed,
            pulled,
            last_synced_at: null,
          },
        };
      }

      const pullBody = (resBody ?? {}) as PullPage;
      const events = Array.isArray(pullBody.events) ? pullBody.events : [];
      const nextCursor =
        typeof pullBody.next_cursor === 'number' ? pullBody.next_cursor : currentState.cursor;
      const previousCursor = currentState.cursor;

      currentState = applyPull(currentState, { events, next_cursor: nextCursor });
      pulled += events.length;

      if (events.length === 0 || nextCursor === previousCursor) {
        break;
      }
    }

    // 7. Best-effort note_sync (failures ignored)
    try {
      await rpc('note_sync', { p_device_id: currentState.device_id });
    } catch {
      // Ignored
    }

    // 8. Completed successfully
    return {
      state: currentState,
      session: currentSession,
      outcome: {
        status: 'ok',
        pushed,
        pulled,
        last_synced_at: new Date().toISOString(),
      },
    };
  } catch (err) {
    if (err instanceof NetworkError) {
      return {
        state: currentState,
        session: currentSession,
        outcome: {
          status: 'offline',
          message: 'offline',
          pushed,
          pulled,
          last_synced_at: null,
        },
      };
    }

    if (err instanceof HttpError) {
      return {
        state: currentState,
        session: currentSession,
        outcome: {
          status: 'error',
          message: err.message,
          pushed,
          pulled,
          last_synced_at: null,
        },
      };
    }

    return {
      state: currentState,
      session: currentSession,
      outcome: {
        status: 'error',
        message: err instanceof Error ? err.message : String(err),
        pushed,
        pulled,
        last_synced_at: null,
      },
    };
  }
}
