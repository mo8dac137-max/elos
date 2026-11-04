import type { GrammarPack } from './types.js';

/**
 * Milestone I1 (vocabulary vertical slice): the first high-frequency word
 * batch for an Arabic-speaking A1 learner. Each word becomes ONE curriculum
 * unit ("word:{lemma}") with its primary A1 sense, flowing through the same
 * kernel, planner, review schedule and session UI as grammar units.
 *
 * Milestone I3 (second batch): 24 more A1 high-frequency words appended AFTER
 * the first batch, so existing learner order and review states are preserved.
 * Batch 2 leans towards the owner's goals (medicine/doctor/hospital/price for
 * the pharmacy and call-centre lines).
 *
 * Full Word DNA (per-sense mastery, receptive/productive tracks, aural
 * recognition, collocations, provider dictionaries) is designed in the
 * handoff and arrives in later slices; one word = one unit with the dominant
 * beginner sense remains the rule for both batches.
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

  // ---- Batch 2 (Milestone I3): 24 more A1 words, appended after batch 1 so
  // existing orders and review states are preserved. Same WordDef contract.
  { id: 'time', pos: 'noun', gloss: 'وقت', en: 'hours and minutes',
    ar: 'كلمة time تعني «وقت».',
    example: "I don't have time today.",
    mistake: 'نقول What time is it? للسؤال عن الوقت، ولا نقول How much is the time?' },
  { id: 'year', pos: 'noun', gloss: 'سنة', en: 'twelve months',
    ar: 'كلمة year تعني «سنة».',
    example: 'This year is very hot.',
    mistake: 'نقول in 2010 بلا the: I was born in 2010.' },
  { id: 'people', pos: 'noun', gloss: 'ناس', en: 'men, women and children',
    ar: 'كلمة people تعني «ناس/أشخاص».',
    example: 'Many people live here.',
    mistake: 'people جمع أصلًا: نقول many people وليس many peoples.' },
  { id: 'man', pos: 'noun', gloss: 'رجل', en: 'an adult male person',
    ar: 'كلمة man تعني «رجل».',
    example: 'The man works here.',
    mistake: 'الجمع شاذ: man → men وليس mans.' },
  { id: 'woman', pos: 'noun', gloss: 'امرأة', en: 'an adult female person',
    ar: 'كلمة woman تعني «امرأة».',
    example: 'The woman is my teacher.',
    mistake: 'الجمع شاذ: woman → women (تُلفظ «ويمِن») وليس womans.' },
  { id: 'child', pos: 'noun', gloss: 'طفل', en: 'a young boy or girl',
    ar: 'كلمة child تعني «طفل».',
    example: 'The child plays in the park.',
    mistake: 'الجمع شاذ: child → children وليس childs.' },
  { id: 'name', pos: 'noun', gloss: 'اسم', en: 'what a person is called',
    ar: 'كلمة name تعني «اسم».',
    example: 'My name is Ali.',
    mistake: 'نقول My name is Ali ولا نحذف is: لا نقول My name Ali.' },
  { id: 'job', pos: 'noun', gloss: 'وظيفة', en: 'the work you do for money',
    ar: 'كلمة job تعني «وظيفة».',
    example: 'She has a good job.',
    mistake: 'job معدودة (a job)، أما work فغير معدود بلا a: نقول a job ولا نقول a work.' },
  { id: 'teacher', pos: 'noun', gloss: 'مدرّس', en: 'a person who teaches',
    ar: 'كلمة teacher تعني «مدرّس/معلم».',
    example: 'The teacher is kind.',
    mistake: 'نقول my teacher بلا the: لا نقول the my teacher.' },
  { id: 'doctor', pos: 'noun', gloss: 'طبيب', en: 'a person who treats ill people',
    ar: 'كلمة doctor تعني «طبيب».',
    example: 'My doctor is busy today.',
    mistake: 'نقول I am a doctor وليس I am doctor — a لازمة قبل اسم المهنة.' },
  { id: 'medicine', pos: 'noun', gloss: 'دواء', en: 'what you take when you are ill',
    ar: 'كلمة medicine تعني «دواء».',
    example: 'This medicine is very good.',
    mistake: 'نقول take medicine بلا a ولا the غالبًا: medicine غير معدودة بمعنى الدواء.' },
  { id: 'hospital', pos: 'noun', gloss: 'مستشفى', en: 'a place that treats ill people',
    ar: 'كلمة hospital تعني «مستشفى».',
    example: 'The hospital is near my house.',
    mistake: 'نقول go to the hospital للزيارة أو العلاج — استعمل the مع hospital.' },
  { id: 'phone', pos: 'noun', gloss: 'هاتف', en: 'a thing you call people with',
    ar: 'كلمة phone تعني «هاتف».',
    example: 'My phone is new.',
    mistake: 'أثناء الكلام نقول on the phone وليس in the phone.' },
  { id: 'price', pos: 'noun', gloss: 'سعر', en: 'the money you pay for a thing',
    ar: 'كلمة price تعني «سعر».',
    example: 'The price is too high.',
    mistake: 'نقول What is the price? أو How much is it? ولا نقول How much is the price?' },
  { id: 'shop', pos: 'noun', gloss: 'متجر', en: 'a place that sells things',
    ar: 'كلمة shop تعني «متجر/دكان».',
    example: 'The shop opens at nine.',
    mistake: 'shopping تعني «التسوق» وليست جمع shop؛ الجمع shops.' },
  { id: 'number', pos: 'noun', gloss: 'رقم', en: 'a count like 1, 2, 3',
    ar: 'كلمة number تعني «رقم».',
    example: 'My lucky number is seven.',
    mistake: 'نقول my phone number وليس my number of phone (خطأ ترجمة حرفية).' },
  { id: 'go', pos: 'verb', gloss: 'يذهب', en: 'to move to another place',
    ar: 'كلمة go تعني «يذهب».',
    example: 'I go to work by bus.',
    mistake: 'نقول go home بلا to (home ظرف)، لكن go to school وgo to work مع to.' },
  { id: 'come', pos: 'verb', gloss: 'يأتي', en: 'to move to where I am',
    ar: 'كلمة come تعني «يأتي».',
    example: 'Please come to my house.',
    mistake: 'نقول come here بلا to (here ظرف مثل home)، والماضي came.' },
  { id: 'see', pos: 'verb', gloss: 'يرى', en: 'to notice with your eyes',
    ar: 'كلمة see تعني «يرى».',
    example: 'I see my friend every week.',
    mistake: 'see للرؤية، وwatch للأفلام والمباريات، وlook at للتأمل — العربية تستعمل «شاف» للجميع.' },
  { id: 'want', pos: 'verb', gloss: 'يريد', en: 'to wish to have or do something',
    ar: 'كلمة want تعني «يريد».',
    example: 'I want a new phone.',
    mistake: 'مع الفعل نقول I want to go وليس I want go — to لازمة بعد want.' },
  { id: 'need', pos: 'verb', gloss: 'يحتاج', en: 'to have to have something',
    ar: 'كلمة need تعني «يحتاج».',
    example: 'I need money for a car.',
    mistake: 'مثل want: نقول I need to go وليس I need go — to لازمة بعد need.' },
  { id: 'know', pos: 'verb', gloss: 'يعرف', en: 'to have information in your head',
    ar: 'كلمة know تعني «يعرف».',
    example: 'I know the answer.',
    mistake: 'الماضي knew، ولا نقول I am know — الفعلان be وknow لا يجتمعان.' },
  { id: 'help', pos: 'verb', gloss: 'يساعد', en: 'to make things easier for someone',
    ar: 'كلمة help تعني «يساعد».',
    example: 'I help my mother at home.',
    mistake: 'نقول Can you help me? — help يأخذ مفعوله مباشرة بلا to.' },
  { id: 'buy', pos: 'verb', gloss: 'يشتري', en: 'to get a thing with money',
    ar: 'كلمة buy تعني «يشتري».',
    example: 'I buy food from this shop.',
    mistake: "الماضي bought يُلفظ «بوت» (u صامتة)، والنفي didn't buy." },
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
