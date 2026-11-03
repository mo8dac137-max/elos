# ELOS GitHub Pages setup (Milestone H1.5) — owner runbook

Do this one-time setup step once. About 1 minute total.

## 1. One-time switch
- Open your GitHub repository → **Settings** → **Pages**.
- Under **Build and deployment**, change **Source** to **GitHub Actions**.
- (مرة واحدة فقط: Settings ثم Pages ثم اختر Source من نوع GitHub Actions.)

## 2. Deployment is automatic
- Every push to `main` runs lint + tests + build and publishes the site.
- Watch the **Actions** tab until the workflow **Deploy to GitHub Pages** turns green.
- (النشر تلقائي مع كل تحديث للمستودع — تابع تبويب Actions حتى يكتمل التشغيل بنجاح.)

## 3. Accessing the app
- The permanent site URL is: https://mo8dac137-max.github.io/elos/
- Open it in any browser (desktop or mobile).
- The PWA can be installed directly (select **Add to Home Screen** on your phone).
- (رابط الموقع الدائم، ويمكن تثبيت التطبيق منه على الهاتف.)

## 4. Rollback and resilience
- If a run fails in Actions, the previously deployed site remains online without interruption.
- Fix the issue locally, push again, and the workflow will publish the new release.
- (إن فشل تشغيل، النسخة المنشورة سابقًا تبقى تعمل دون انقطاع، قم بإصلاح الخلل ثم أرسل التحديث.)
