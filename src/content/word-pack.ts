import type { GrammarPack } from './types.js';

/**
 * Milestone I1 (vocabulary vertical slice): the first high-frequency word
 * batch for an Arabic-speaking A1 learner. Each word becomes ONE curriculum
 * unit ("word:{lemma}") with its primary A1 sense, flowing through the same
 * kernel, planner, review schedule and session UI as grammar units.
 *
 * Full Word DNA (per-sense mastery, receptive/productive tracks, aural
 * recognition, collocations, provider dictionaries) is designed in the
 * handoff and arrives in later slices; I1 deliberately keeps one word =
 * one unit with the dominant beginner sense.
 *
 * Everything here is deterministic: no clock, no randomness, no I/O.
 */

export interface WordDef {
  /** The lemma itself, lowercase, used in ids, prompts and answers. */
  id: string;
  pos: 'noun' | 'verb';
  /** The primary A1 Arabic gloss. */
  gloss: string;
  /** A short English gloss used as the note_en of generated items. */
  en: string;
  /** The Arabic teaching line shown on the intro card (summary_ar). */
  ar: string;
  /** One English sentence that contains the lemma exactly once, in the
   *  base form, lowercase, not at the start of the sentence. */
  example: string;
  /** A real, useful common-mistake note in Arabic (summary on the unit card). */
  mistake: string;
}

export const WORD_DEFS: readonly WordDef[] = [
  { id: 'book', pos: 'noun', gloss: 'كتاب', en: 'a thing with pages that you read',
    ar: 'كلمة book تعني «كتاب»: الشيء الذي تقرأه من صفحاته.',
    example: 'I read a book every night.',
    mistake: 'المفرد المعدود يحتاج a: نقول I read a book ولا نقول I read book.' },
  { id: 'water', pos: 'noun', gloss: 'ماء', en: 'the liquid you drink',
    ar: 'كلمة water تعني «ماء»: السائل الذي نشربه.',
    example: 'I drink water every day.',
    mistake: 'water غير معدودة: نقول some water ولا نقول a water أو waters.' },
  { id: 'food', pos: 'noun', gloss: 'طعام', en: 'what you eat',
    ar: 'كلمة food تعني «طعام»: ما نأكله.',
    example: 'The food here is good.',
    mistake: 'food غير معدودة غالبًا: نقول some food ولا نقول a food أو foods.' },
  { id: 'house', pos: 'noun', gloss: 'بيت', en: 'a building where you live',
    ar: 'كلمة house تعني «بيت/منزل»: المبنى الذي تسكن فيه.',
    example: 'My house is near the school.',
    mistake: 'house هي المبنى، أما home فهي المكان أو الشعور: نقول I go home بلا to.' },
  { id: 'friend', pos: 'noun', gloss: 'صديق', en: 'a person you like and know well',
    ar: 'كلمة friend تعني «صديق»: الشخص الذي تحب صحبته.',
    example: 'My friend speaks English.',
    mistake: 'المؤنث «صديقة» تُترجم friend أيضًا والسياق يوضح، والجمع friends.' },
  { id: 'money', pos: 'noun', gloss: 'مال', en: 'what you pay with',
    ar: 'كلمة money تعني «مال/نقود»: ما ندفع به.',
    example: 'I need money for the bus.',
    mistake: 'money غير معدودة: نقول some money ولا نقول moneys.' },
  { id: 'day', pos: 'noun', gloss: 'يوم', en: 'twenty-four hours',
    ar: 'كلمة day تعني «يوم».',
    example: 'I work eight hours a day.',
    mistake: 'أسماء الأيام تبدأ بحرف كبير في الإنجليزية: Monday وليس monday.' },
  { id: 'night', pos: 'noun', gloss: 'ليل', en: 'the dark time after the evening',
    ar: 'كلمة night تعني «ليل»: الوقت المظلم بعد المساء.',
    example: 'I study at night.',
    mistake: 'نقول at night بحرف at دائمًا ولا نقول in night.' },
  { id: 'morning', pos: 'noun', gloss: 'صباح', en: 'the first part of the day',
    ar: 'كلمة morning تعني «صباح»: أول النهار.',
    example: 'I drink tea in the morning.',
    mistake: 'this morning وtomorrow morning تأتي بلا the.' },
  { id: 'week', pos: 'noun', gloss: 'أسبوع', en: 'seven days',
    ar: 'كلمة week تعني «أسبوع»: سبعة أيام.',
    example: 'I work five days a week.',
    mistake: 'للتكرار الزمني نقول a week: I work five days a week.' },
  { id: 'family', pos: 'noun', gloss: 'عائلة', en: 'parents and children together',
    ar: 'كلمة family تعني «عائلة»: الوالدان والأبناء معًا.',
    example: 'My family is big.',
    mistake: 'family اسم مفرد فالفعل معه مفرد: My family is big.' },
  { id: 'car', pos: 'noun', gloss: 'سيارة', en: 'a machine with four wheels for driving',
    ar: 'كلمة car تعني «سيارة».',
    example: 'My car is old.',
    mistake: 'للوسيلة نقول by car بلا a ولا the: I go by car.' },
  { id: 'city', pos: 'noun', gloss: 'مدينة', en: 'a big town',
    ar: 'كلمة city تعني «مدينة»: بلدة كبيرة.',
    example: 'Cairo is a big city.',
    mistake: 'أسماء المدن تأتي بلا the: I live in Cairo.' },
  { id: 'school', pos: 'noun', gloss: 'مدرسة', en: 'a place where children learn',
    ar: 'كلمة school تعني «مدرسة»: مكان تعلّم الأبناء.',
    example: 'The children go to school.',
    mistake: 'go to school بمعنى الدراسة تأتي بلا the، أما the school فتعني المبنى.' },
  { id: 'question', pos: 'noun', gloss: 'سؤال', en: 'a sentence that asks something',
    ar: 'كلمة question تعني «سؤال»: الجملة التي تستفسر عن شيء.',
    example: 'Can I ask a question?',
    mistake: 'نقول ask a question ولا نقول say a question.' },
  { id: 'answer', pos: 'noun', gloss: 'جواب', en: 'what you say to a question',
    ar: 'كلمة answer تعني «جواب/إجابة»: ما ترد به على السؤال.',
    example: 'I know the answer.',
    mistake: 'الفعل answer يأخذ مفعوله مباشرة: answer the question بلا to.' },
  { id: 'word', pos: 'noun', gloss: 'كلمة', en: 'a unit of language with a meaning',
    ar: 'كلمة word تعني «كلمة»: وحدة اللغة ذات المعنى.',
    example: 'This word is new.',
    mistake: 'المفرد word والجمع words: five new words.' },
  { id: 'work', pos: 'verb', gloss: 'يعمل', en: 'to do a job',
    ar: 'كلمة work تعني «يعمل»: يؤدي عملًا أو وظيفة.',
    example: 'I work in a school.',
    mistake: 'work فعل ومكان عمل، أما «الوظيفة» فهي job: I go to work.' },
  { id: 'read', pos: 'verb', gloss: 'يقرأ', en: 'to look at words and understand them',
    ar: 'كلمة read تعني «يقرأ»: ينظر إلى الكلمات ويفهمها.',
    example: 'We read English every morning.',
    mistake: 'الحاضر read يُلفظ مثل need والماضي read يُلفظ مثل red — الكتابة واحدة!' },
  { id: 'write', pos: 'verb', gloss: 'يكتب', en: 'to make words with a pen or keyboard',
    ar: 'كلمة write تعني «يكتب»: يخط الكلمات بقلم أو لوحة مفاتيح.',
    example: 'I write my homework at night.',
    mistake: 'عند إضافة ing نحذف الـe الصامتة: write تصبح writing وليس writeing.' },
  { id: 'eat', pos: 'verb', gloss: 'يأكل', en: 'to put food in your mouth',
    ar: 'كلمة eat تعني «يأكل».',
    example: 'We eat dinner at seven.',
    mistake: 'لتناول الوجبات نقول أيضًا have: We have dinner at seven.' },
  { id: 'drink', pos: 'verb', gloss: 'يشرب', en: 'to take liquid into your mouth',
    ar: 'كلمة drink تعني «يشرب»: يتناول السائل.',
    example: 'I drink coffee at work.',
    mistake: 'مع الدواء نستعمل take لا drink: take medicine.' },
  { id: 'speak', pos: 'verb', gloss: 'يتحدث', en: 'to say words; to talk a language',
    ar: 'كلمة speak تعني «يتحدث/يتكلم» بلسان أو بلغة.',
    example: 'Do you speak English?',
    mistake: 'أسماء اللغات تأتي بلا the: speak English ولا نقول speak the English.' },
  { id: 'learn', pos: 'verb', gloss: 'يتعلم', en: 'to get new knowledge or a new skill',
    ar: 'كلمة learn تعني «يتعلم»: يكتسب علمًا أو مهارة.',
    example: 'I learn five words every day.',
    mistake: 'نقول learn English للغة، وstudy للدراسة الجادة: study medicine.' },
];

export const WORD_COUNT = WORD_DEFS.length;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The two same-part-of-speech words that follow this one in pack order
 * (cyclically). Used as deterministic distractors so that options never mix
 * a noun meaning with verb meanings.
 */
function nextTwoSamePos(def: WordDef): [WordDef, WordDef] {
  const pos = WORD_DEFS.findIndex((w) => w.id === def.id);
  const peers = WORD_DEFS
    .map((w, i) => ({ w, i }))
    .filter(({ w, i }) => w.pos === def.pos && i !== pos)
    .map(({ w }) => w);
  const after = peers.filter(
    (w) => WORD_DEFS.findIndex((x) => x.id === w.id) > pos
  );
  const before = peers.filter(
    (w) => WORD_DEFS.findIndex((x) => x.id === w.id) < pos
  );
  const ordered = [...after, ...before];
  return [ordered[0], ordered[1]];
}

/** Place the answer among the two distractors at the given position (0-2). */
function rotate3(answer: string, d1: string, d2: string, position: number): string[] {
  const base = [d1, d2];
  const pos = ((position % 3) + 3) % 3;
  base.splice(pos, 0, answer);
  return base;
}

function buildUnits(): GrammarPack['units'] {
  return WORD_DEFS.map((def) => ({
    id: `word:${def.id}`,
    title: `Word: ${def.id}`,
    cefr: 'A1' as const,
    prerequisites: [],
    summary_en: `${def.id} (${def.pos}): ${def.en}.`,
    summary_ar: def.ar,
    examples: [def.example],
    common_mistake_ar: def.mistake,
  }));
}

function buildItems(): GrammarPack['items'] {
  const items: GrammarPack['items'] = [];
  for (let i = 0; i < WORD_DEFS.length; i++) {
    const def = WORD_DEFS[i];
    const [a, b] = nextTwoSamePos(def);
    const unitId = `word:${def.id}`;

    // 1. Meaning recognition: English word -> choose the Arabic gloss.
    items.push({
      id: `w-${def.id}-1`,
      unit_id: unitId,
      task_class: 'recognition_item' as const,
      context_id: `w-${def.id}-1`,
      prompt: `What does «${def.id}» mean?`,
      options: rotate3(def.gloss, a.gloss, b.gloss, i % 3),
      answer: def.gloss,
      note_en: def.en,
      skill: 'vocabulary' as const,
    });

    // 2. Context recognition: the example sentence with the lemma blanked.
    const fillPrompt = def.example.replace(
      new RegExp(`\\b${escapeRegExp(def.id)}\\b`),
      '___'
    );
    items.push({
      id: `w-${def.id}-2`,
      unit_id: unitId,
      task_class: 'recognition_item' as const,
      context_id: `w-${def.id}-2`,
      prompt: fillPrompt,
      options: rotate3(def.id, a.id, b.id, (i + 1) % 3),
      answer: def.id,
      note_en: def.en,
      skill: 'vocabulary' as const,
    });

    // 3. Production: Arabic gloss -> type the English word.
    items.push({
      id: `w-${def.id}-3`,
      unit_id: unitId,
      task_class: 'controlled_recall' as const,
      context_id: `w-${def.id}-3`,
      prompt: `Type in English: ${def.gloss}`,
      answer: def.id,
      note_en: def.en,
      skill: 'vocabulary' as const,
    });
  }
  return items;
}

export const WORD_PACK: GrammarPack = {
  units: buildUnits(),
  items: buildItems(),
};
