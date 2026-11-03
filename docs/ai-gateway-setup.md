# ELOS AI Gateway setup (Milestone H1) — owner runbook

Do these steps once, in order. About 5 minutes total.

## 1. Run the database migration
- Open **SQL Editor** → **New query**.
- Copy the WHOLE file `supabase/migrations/0002_ai_ledger.sql` from the repository and paste it into the editor.
- Press **Run**. Expected result: `Success. No rows returned`.
- (بالعربية: انسخ ملف supabase/migrations/0002_ai_ledger.sql كاملًا والصقه في SQL Editor ثم اضغط Run. المتوقع: Success. No rows returned.)

## 2. Get a Gemini API key
- Go to https://aistudio.google.com → **Get API key** → create a key in the free tier.
- NEVER paste this key into the chat, the repository, or any code file.
- (بالعربية: احصل على المفتاح من Google AI Studio ولا ترسله لأحد أبدًا.)

## 3. Deploy the function
- Open **Edge Functions** in your Supabase Dashboard → **Create a new function**.
- Name it EXACTLY `ai-gateway`.
- Paste the whole content of `supabase/functions/ai-gateway/index.ts`.
- Keep **Verify JWT** ENABLED.
- Click **Deploy**. First deploy may take a minute to become live.
- **Redeploying after updates:** whenever `supabase/functions/ai-gateway/index.ts` changes in the repository, repeat this step with the new file (open your function → paste the new code → Deploy). The app tells you when this is needed (e.g. the explain button reports the server needs the updated function).
- (بالعربية: افتح Edge Functions وأنشئ دالة جديدة بالاسم ai-gateway والصق محتوى supabase/functions/ai-gateway/index.ts مع تفعيل Verify JWT ثم اضغط Deploy. وعند أي تحديث للملف في المستودع أعِد نفس الخطوة بالكود الجديد.)

## 4. Set the secret
- In Edge Functions → **Manage secrets** (or Secrets) → add `GEMINI_API_KEY` with the key's value.
- Optional secrets: `GEMINI_MODEL` (default `gemini-flash-latest`) and `AI_DAILY_CAP` (default `200`).
- (بالعربية: أضف السر GEMINI_API_KEY بقيمة المفتاح، واختياريًا GEMINI_MODEL و AI_DAILY_CAP.)

## 5. Test connection
- Open the app → sign in → click **Test AI connection**.
- Expected: `AI ready ... Reply: pong`.
- If it reports a model problem, set `GEMINI_MODEL` to a current Flash model name and test again.
- (بالعربية: افتح التطبيق، وسجل الدخول، واضغط Test AI connection للتأكد من اتصال pong بنجاح.)

## 6. Explain with AI (H2)
- Open the app → **Progress map** → tap a unit → **Explain with AI (Arabic)**.
- Requires sign-in and the CURRENT function version from step 3.
- The reply is a simple Arabic explanation in a fixed five-part scaffold (الفكرة / خطوات / أمثلة جديدة / انتبه / جرّب).
- It is plain help only: it never changes your progress, and no personal learning data is sent to the AI.
- Waiting up to ~30 seconds is normal on the free tier. If Google is congested (`http_503`) the function retries once automatically; if a call exceeds 25 seconds it stops with `AI error: timeout` instead of hanging forever. Both are transient — just try again.
- (بالعربية: من خريطة التقدم افتح الوحدة واضغط Explain with AI (Arabic) لشرح عربي مبسط بخمسة أقسام ثابتة. الشرح مجرد مساعدة ولا يؤثر على بيانات تقدمك، ولا تُرسل أي بيانات شخصية للذكاء الاصطناعي. الانتظار حتى 30 ثانية طبيعي في الخطة المجانية؛ عند ازدحام Google يعيد النظام المحاولة مرة تلقائيًا، وإذا تجاوز الطلب 25 ثانية يتوقف برسالة timeout بدل التعليق — أعِد المحاولة فقط.)

## 7. No-AI mode
- With no key set, the button reports `AI disabled` and every learning feature keeps working offline.
- (بالعربية: في حال عدم تعيين مفتاح، يوضح التطبيق أن الذكاء الاصطناعي معطل، وتستمر جميع وظائف التعلم بالعمل دون اتصال.)
