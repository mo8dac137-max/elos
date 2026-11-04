# Smart Reader (Milestone J1 + J2)

## English

The Read screen lets the learner read any short English text with every
word colored by the state derived from his own evidence log — the same
source of truth as the progress map (kernel `deriveFromClient`, one word
unit = one color):

- **Green** = known (controlled and above)
- **Yellow** = learning (exposure / recognition)
- **Blue** = new (in the course, not started yet)
- **Plain** = outside the course (still tappable)

Tapping a word opens a card: the derived state, the Arabic gloss and the
common-mistake note for the 48 curriculum words, plus the real dictionary
section (Free Dictionary API with the permanent on-device cache, from
Milestone I2) for every word.

What the reader deliberately does NOT do (recorded limits):

- Reading records **no evidence events** yet (the reading evidence
  taxonomy is a later, designed addition; reading is consumption here).
- Normalization stays conservative: a hand-picked irregular map (J2:
  "went"→go, "children"→child, ...) covers only forms whose base is one of
  the 48 curriculum words, plus regular suffixes (-s/-es/-ies/-ed).
  Unknown irregulars and all **-ing forms** still do not match.
- The chosen text is a UI preference saved in `localStorage`
  (`elos_reader_doc`), never learning data, never synced.

Files: `src/app/reader.ts` (pure logic), `src/content/reader-texts.ts`
(six original A1 texts; the two J2 texts use past tenses and irregular
plurals on purpose), `src/ui/screens/reader.ts` (screen),
`src/ui/screens/backupTools.ts` (extracted from main.ts to respect the
400-line rule), `tests/reader.test.ts`.

## العربية

شاشة «Read» تتيح قراءة أي نص إنجليزي قصير مع تلوين كل كلمة حسب حالتها
المشتقة من سجل الأدلة الخاص بالمتعلم — نفس مصدر الحقيقة في خريطة التقدم:

- **أخضر** = معروفة (controlled فأعلى)
- **أصفر** = قيد التعلم (exposure / recognition)
- **أزرق** = جديدة (في المنهج ولم تبدأ بعد)
- **عادية** = خارج المنهج (وقابلة للضغط أيضًا)

الضغط على أي كلمة يفتح بطاقة: الحالة المشتقة، والمعنى العربي وملاحظة
الخطأ الشائع لكلمات المنهج الـ48، وقسم القاموس الحقيقي (Free Dictionary
API مع الكاش الدائم على الجهاز من مرحلة I2) لكل كلمة.

حدود مقصودة مسجلة: القراءة لا تسجل أحداث أدلة بعد؛ التطبيع محافظ — خريطة
صيغ شاذة مختارة يدويًا (J2: went→go وchildren→child وغيرها) تغطي فقط
الصيغ التي أصلها من كلمات المنهج الـ48، مع اللواحق المنتظمة (-s/-es/-ies/-ed)،
وبقية الشواذ وصيغ -ing لا تطابق بعد؛ النص المحفوظ تفضيل واجهة في
localStorage وليس بيانات تعلم ولا يُزامن.
