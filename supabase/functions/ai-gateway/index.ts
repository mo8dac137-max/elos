import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ALLOWED_TASKS = ['ping', 'explain_unit'];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
    },
  });
}

interface ExplainUnitInput {
  unit_id: string;
  title: string;
  summary_en: string;
  summary_ar: string;
  examples: string[];
  common_mistake_ar: string;
}

function isStr(v: unknown, min: number, max: number): boolean {
  return typeof v === 'string' && v.length >= min && v.length <= max;
}

/**
 * Deterministic validation of the explain_unit payload.
 * Only public curriculum content is accepted (never learner data),
 * with strict length caps on every field.
 */
function validateExplainPayload(payload: unknown): ExplainUnitInput | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const p = payload as Record<string, unknown>;
  if (!isStr(p.unit_id, 3, 100) || !/^[a-z0-9:_-]+$/.test(p.unit_id)) return null;
  if (!p.unit || typeof p.unit !== 'object' || Array.isArray(p.unit)) return null;
  const u = p.unit as Record<string, unknown>;
  if (!isStr(u.title, 1, 120)) return null;
  if (!isStr(u.summary_en, 1, 600)) return null;
  if (!isStr(u.summary_ar, 1, 1200)) return null;
  if (!isStr(u.common_mistake_ar, 0, 600)) return null;
  if (!Array.isArray(u.examples) || u.examples.length > 8) return null;
  const examples: string[] = [];
  for (const ex of u.examples) {
    if (!isStr(ex, 1, 200)) return null;
    examples.push(ex);
  }
  return {
    unit_id: p.unit_id,
    title: u.title,
    summary_en: u.summary_en,
    summary_ar: u.summary_ar,
    examples,
    common_mistake_ar: u.common_mistake_ar,
  };
}

/** Arabic scaffolding prompt: a fixed five-section structure for an A1 learner. */
function buildExplainPrompt(input: ExplainUnitInput): string {
  return [
    'You are an English teacher for an Arabic-speaking beginner learner (A1).',
    'Explain the grammar unit below in very simple Arabic.',
    '',
    'Unit title: ' + input.title,
    'English rule: ' + input.summary_en,
    'Current Arabic note: ' + input.summary_ar,
    'Examples: ' + (input.examples.length > 0 ? input.examples.join(' | ') : 'none'),
    'Common mistake: ' + (input.common_mistake_ar || 'none'),
    '',
    'Write the explanation in simple Arabic, organized in this exact order with these labels, each label on its own line:',
    'الفكرة:',
    'خطوات:',
    'أمثلة جديدة:',
    'انتبه:',
    'جرّب:',
    '',
    'Rules:',
    '- Very simple Arabic for a beginner. Keep English words and example sentences in English.',
    '- Under أمثلة جديدة: three NEW example sentences (not the ones above), each followed by its Arabic translation.',
    '- Under انتبه: the common mistake and how to avoid it.',
    '- Under جرّب: one fill-in-the-blank sentence, then on the next line the correct answer.',
    '- No Markdown, no asterisks, no dashes at line starts, no numbering. Short lines. Maximum 250 words total.',
  ].join('\n');
}

/** Deterministic output gate: Arabic text within bounds following the scaffold. */
function isValidExplanation(text: string): boolean {
  if (text.length < 20 || text.length > 4000) return false;
  if (!/[\u0600-\u06FF]/.test(text)) return false;
  return text.includes('الفكرة');
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
    } else if (task === 'explain_unit') {
      const input = validateExplainPayload(body.payload);
      if (!input) {
        return jsonResponse({ ok: false, code: 'bad_payload' }, 200);
      }
      prompt = buildExplainPrompt(input);
    }

    const MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-flash-latest';
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    const GEMINI_TIMEOUT_MS = 25_000;
    const requestBody = JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    });

    /** Bounded Gemini call: aborts after GEMINI_TIMEOUT_MS instead of hanging. */
    async function postGemini(): Promise<Response> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
      try {
        return await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: requestBody,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
    }

    let status: 'ok' | 'error' = 'ok';
    let errorCode: string | null = null;
    let text = '';

    try {
      let geminiRes = await postGemini();
      // One retry on transient Google overload / rate limiting (fast failures only).
      if (geminiRes.status === 503 || geminiRes.status === 429) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        geminiRes = await postGemini();
      }

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
    } catch (err) {
      status = 'error';
      errorCode = err instanceof Error && err.name === 'AbortError' ? 'timeout' : 'network';
    }

    if (task === 'explain_unit' && status === 'ok' && !isValidExplanation(text)) {
      status = 'error';
      errorCode = 'bad_output';
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
