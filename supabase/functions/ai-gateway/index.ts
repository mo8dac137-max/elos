import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ALLOWED_TASKS = ['ping'];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
    },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS,
    });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, code: 'bad_method' }, 405);
  }

  try {
    let body: { task?: unknown; payload?: unknown };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ ok: false, code: 'bad_body' }, 400);
    }

    if (!body || typeof body !== 'object' || typeof body.task !== 'string') {
      return jsonResponse({ ok: false, code: 'bad_body' }, 400);
    }

    const task = body.task;
    if (!ALLOWED_TASKS.includes(task)) {
      return jsonResponse({ ok: false, code: 'bad_task' }, 200);
    }

    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      return jsonResponse({ ok: false, code: 'not_authenticated' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user?.id) {
      return jsonResponse({ ok: false, code: 'not_authenticated' }, 401);
    }
    const userId = userData.user.id;

    const DAILY_CAP = Number(Deno.env.get('AI_DAILY_CAP') ?? '200');
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const todayStartIso = today.toISOString();

    let usedToday = 0;
    try {
      const { count, error } = await supabase
        .from('ai_calls')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', todayStartIso);
      if (!error && typeof count === 'number') {
        usedToday = count;
      }
    } catch {
      usedToday = 0;
    }

    if (usedToday >= DAILY_CAP) {
      return jsonResponse({
        ok: false,
        code: 'daily_cap_reached',
        used_today: usedToday,
        cap: DAILY_CAP,
      }, 200);
    }

    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
    if (!GEMINI_API_KEY) {
      return jsonResponse({ ok: false, code: 'ai_disabled' }, 200);
    }

    let prompt = '';
    if (task === 'ping') {
      prompt = 'Reply with exactly the word: pong';
    }

    const MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-flash-latest';
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    let status: 'ok' | 'error' = 'ok';
    let errorCode: string | null = null;
    let text = '';

    try {
      const geminiRes = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
        }),
      });

      if (!geminiRes.ok) {
        status = 'error';
        errorCode = 'http_' + geminiRes.status;
      } else {
        const data = await geminiRes.json();
        const parts = data?.candidates?.[0]?.content?.parts;
        if (Array.isArray(parts)) {
          text = parts
            .map((p: { text?: unknown }) => (typeof p?.text === 'string' ? p.text : ''))
            .join('');
        }
        if (!text) {
          status = 'error';
          errorCode = 'bad_response';
        }
      }
    } catch {
      status = 'error';
      errorCode = 'network';
    }

    try {
      await supabase.from('ai_calls').insert({
        user_id: userId,
        task,
        status,
        error_code: errorCode,
        model: MODEL,
        input_chars: prompt.length,
        output_chars: text.length,
      });
    } catch {
      // Best effort ledger write
    }

    if (status === 'ok') {
      return jsonResponse({
        ok: true,
        task,
        model: MODEL,
        text,
        used_today: usedToday + 1,
        cap: DAILY_CAP,
      }, 200);
    }

    return jsonResponse({ ok: false, code: errorCode }, 200);
  } catch {
    return jsonResponse({ ok: false, code: 'internal' }, 500);
  }
});
