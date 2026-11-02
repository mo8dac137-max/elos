# ELOS Supabase setup (Milestone G1) — owner runbook

Do these steps once, in order. About 5 minutes total.
Dashboard: https://supabase.com/dashboard/project/mfszifstqsxvrpeggrrq

## 1. Run the database migration
- Open **SQL Editor** → **New query**.
- Copy the WHOLE file `supabase/migrations/0001_init.sql` from the repository and paste it into the editor.
- Press **Run**. Expected result: `Success. No rows returned`.
- (بالعربية: انسخ ملف supabase/migrations/0001_init.sql كاملًا والصقه في SQL Editor ثم اضغط Run. المتوقع: Success. No rows returned.)

## 2. Close the door (no sign-ups)
- Open **Authentication** → **Sign In / Up**.
- Turn **OFF** the setting "Allow new users to sign up".
- (بالعربية: أطفئ خيار السماح بمستخدمين جدد حتى لا يستطيع أحد غيرك إنشاء حساب.)

## 3. Create your single login
- Open **Authentication** → **Users** → **Add user** (button name may be "Create user").
- Enter your email address and a LONG password (use a password manager; you will use this email + password to sign in inside ELOS later).
- Enable **Auto Confirm User** if the option is shown, then create the user.
- (بالعربية: أنشئ مستخدمًا واحدًا ببريدك وكلمة مرور طويلة. هذه هي بيانات الدخول التي ستستخدمها داخل التطبيق لاحقًا.)

## 4. Keys policy (already correct — nothing to do)
- ELOS uses only the Project URL and the **publishable key** (public by design, safe in the app).
- The **secret key** stays server-side only and is NEVER pasted into chat, code, or this repository.
- (بالعربية: نستخدم المفتاح العام فقط. المفتاح السري لا يُرسل في الشات أبدًا ولا يوضع في المستودع.)

When finished, tell the supervisor "تم G1". The reviewer will then verify from outside that
row-level security is active, anonymous users can read nothing, and the sync functions can
only be called by authenticated users.
