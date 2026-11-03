import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../sync/config.js';
import type { AuthSession } from '../sync/auth.js';

export type AiFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string }
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export type AiOutcome =
  | { status: 'ok'; text: string; model: string; callsToday: number; cap: number }
  | { status: 'not_signed_in' }
  | { status: 'offline' }
  | { status: 'ai_disabled' }
  | { status: 'daily_cap_reached'; usedToday: number; cap: number }
  | { status: 'error'; message: string };

export async function callAi(
  fetchImpl: AiFetch,
  session: AuthSession | null,
  task: string,
  payload: Record<string, unknown>
): Promise<AiOutcome> {
  if (!session) {
    return { status: 'not_signed_in' };
  }

  const url = `${SUPABASE_URL}/functions/v1/ai-gateway`;
  const headers: Record<string, string> = {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    Authorization: 'Bearer ' + session.access_token,
    'Content-Type': 'application/json',
  };

  let res: { ok: boolean; status: number; json(): Promise<unknown> };
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ task, payload }),
    });
  } catch {
    return { status: 'offline' };
  }

  if (res.status === 401 || res.status === 403) {
    return { status: 'not_signed_in' };
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { status: 'error', message: 'bad_response' };
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { status: 'error', message: 'bad_response' };
  }

  const data = body as Record<string, unknown>;

  if (data.ok === true) {
    if (
      typeof data.text !== 'string' ||
      typeof data.model !== 'string' ||
      typeof data.used_today !== 'number' ||
      Number.isNaN(data.used_today) ||
      typeof data.cap !== 'number' ||
      Number.isNaN(data.cap)
    ) {
      return { status: 'error', message: 'bad_response' };
    }
    return {
      status: 'ok',
      text: String(data.text),
      model: String(data.model),
      callsToday: Number(data.used_today),
      cap: Number(data.cap),
    };
  }

  if (data.ok === false) {
    const code = typeof data.code === 'string' ? data.code : 'unknown';
    if (code === 'ai_disabled') {
      return { status: 'ai_disabled' };
    }
    if (code === 'daily_cap_reached') {
      return {
        status: 'daily_cap_reached',
        usedToday: Number(data.used_today),
        cap: Number(data.cap),
      };
    }
    const messageDetail = typeof data.message === 'string' ? ': ' + data.message : '';
    return {
      status: 'error',
      message: code + messageDetail,
    };
  }

  return { status: 'error', message: 'bad_response' };
}
