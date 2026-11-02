import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './config.js';

export interface AuthSession {
  access_token: string;
  refresh_token: string;
  expires_at: string;
}

export class SignInError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'SignInError';
    this.code = code;
  }
}

export interface SyncResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export type SyncFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string }
) => Promise<SyncResponse>;

function parseAuthPayload(data: unknown): AuthSession {
  if (!data || typeof data !== 'object') {
    throw new SignInError('bad_response', 'Auth response is not an object');
  }
  const obj = data as Record<string, unknown>;
  const accessToken = obj.access_token;
  const refreshToken = obj.refresh_token;
  const expiresIn = obj.expires_in;

  if (typeof accessToken !== 'string' || accessToken.trim() === '') {
    throw new SignInError('bad_response', 'Missing or invalid access_token');
  }
  if (typeof refreshToken !== 'string' || refreshToken.trim() === '') {
    throw new SignInError('bad_response', 'Missing or invalid refresh_token');
  }
  if (typeof expiresIn !== 'number' || expiresIn <= 0 || Number.isNaN(expiresIn)) {
    throw new SignInError('bad_response', 'Missing or invalid expires_in');
  }

  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: expiresAt,
  };
}

export async function signIn(
  fetchImpl: SyncFetch,
  email: string,
  password: string
): Promise<AuthSession> {
  const url = `${SUPABASE_URL}/auth/v1/token?grant_type=password`;
  const headers = {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    'Content-Type': 'application/json',
  };
  const body = JSON.stringify({ email, password });

  let res: SyncResponse;
  try {
    res = await fetchImpl(url, { method: 'POST', headers, body });
  } catch {
    throw new SignInError('network', 'Network error during sign-in');
  }

  if (res.ok) {
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      throw new SignInError('bad_response', 'Failed to parse JSON response');
    }
    return parseAuthPayload(data);
  }

  let errObj: Record<string, unknown> | null = null;
  try {
    const raw = await res.json();
    if (raw && typeof raw === 'object') {
      errObj = raw as Record<string, unknown>;
    }
  } catch {
    // Non-JSON or unreadable error body
  }

  if (errObj) {
    const code =
      typeof errObj.error_code === 'string' && errObj.error_code.trim() !== ''
        ? errObj.error_code
        : typeof errObj.code === 'string' && errObj.code.trim() !== ''
        ? errObj.code
        : 'http_' + res.status;
    const msg =
      typeof errObj.msg === 'string'
        ? errObj.msg
        : typeof errObj.error_description === 'string'
        ? errObj.error_description
        : typeof errObj.error === 'string'
        ? errObj.error
        : typeof errObj.message === 'string'
        ? errObj.message
        : 'HTTP ' + res.status;
    throw new SignInError(code, msg);
  }

  throw new SignInError('http_' + res.status, 'HTTP ' + res.status);
}

export async function refreshSession(
  fetchImpl: SyncFetch,
  session: AuthSession
): Promise<AuthSession> {
  const url = `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`;
  const headers = {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    'Content-Type': 'application/json',
  };
  const body = JSON.stringify({ refresh_token: session.refresh_token });

  let res: SyncResponse;
  try {
    res = await fetchImpl(url, { method: 'POST', headers, body });
  } catch {
    throw new SignInError('network', 'Network error during session refresh');
  }

  if (res.ok) {
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      throw new SignInError('bad_response', 'Failed to parse refresh JSON response');
    }
    return parseAuthPayload(data);
  }

  let errObj: Record<string, unknown> | null = null;
  try {
    const raw = await res.json();
    if (raw && typeof raw === 'object') {
      errObj = raw as Record<string, unknown>;
    }
  } catch {
    // Unreadable
  }

  if (errObj) {
    const code =
      typeof errObj.error_code === 'string' && errObj.error_code.trim() !== ''
        ? errObj.error_code
        : typeof errObj.code === 'string' && errObj.code.trim() !== ''
        ? errObj.code
        : 'refresh_failed';
    const msg =
      typeof errObj.msg === 'string'
        ? errObj.msg
        : typeof errObj.error_description === 'string'
        ? errObj.error_description
        : typeof errObj.error === 'string'
        ? errObj.error
        : typeof errObj.message === 'string'
        ? errObj.message
        : 'HTTP ' + res.status;
    throw new SignInError(code, msg);
  }

  throw new SignInError('http_' + res.status, 'HTTP ' + res.status);
}

export async function ensureFreshSession(
  fetchImpl: SyncFetch,
  session: AuthSession,
  nowMs?: number
): Promise<AuthSession> {
  const current = nowMs ?? Date.now();
  const expiresAtMs = Date.parse(session.expires_at);

  if (expiresAtMs - current > 60000) {
    return session;
  }

  try {
    return await refreshSession(fetchImpl, session);
  } catch {
    return session;
  }
}
