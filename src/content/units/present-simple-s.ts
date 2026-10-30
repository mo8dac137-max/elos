import type { UnitData } from "../types.js";

export const UNIT_DATA: UnitData = {
  unit: {
    "id": "grammar:present-simple-s",
    "title": "Present simple: he/she/it + -s",
    "cefr": "A1",
    "prerequisites": [],
    "summary_en": "With he, she, it (and singular nouns) add -s or -es to the verb: she works, he watches. With I, you, we, they use the base verb: we work.",
    "summary_ar": "مع he وshe وit (والمفرد) نضيف s أو es للفعل: she works. ومع I وyou وwe وthey نستخدم الفعل كما هو.",
    "examples": [
      "She drinks tea every morning.",
      "He watches TV at night.",
      "They play football on Fridays."
    ],
    "common_mistake_ar": "الخطأ الشائع: نسيان s مع المفرد (He go) أو إضافتها مع I وwe (I works)."
  },
  items: [
    {"id": "ps-1", "unit_id": "grammar:present-simple-s", "task_class": "recognition_item", "context_id": "ps-1", "prompt": "He ___ to school by bus.", "options": ["go", "goes", "going"], "answer": "goes"},
    {"id": "ps-2", "unit_id": "grammar:present-simple-s", "task_class": "recognition_item", "context_id": "ps-2", "prompt": "My sister ___ English every day.", "options": ["study", "studies", "studys"], "answer": "studies"},
    {"id": "ps-3", "unit_id": "grammar:present-simple-s", "task_class": "recognition_item", "context_id": "ps-3", "prompt": "They ___ football on Fridays.", "options": ["plays", "play", "playing"], "answer": "play"},
    {"id": "ps-4", "unit_id": "grammar:present-simple-s", "task_class": "recognition_item", "context_id": "ps-4", "prompt": "The shop ___ at nine.", "options": ["opens", "open", "opening"], "answer": "opens"},
    {"id": "ps-5", "unit_id": "grammar:present-simple-s", "task_class": "controlled_recall", "context_id": "ps-5", "prompt": "She ___ tea in the morning. (drink)", "answer": "drinks"},
    {"id": "ps-6", "unit_id": "grammar:present-simple-s", "task_class": "controlled_recall", "context_id": "ps-6", "prompt": "My brother ___ TV every night. (watch)", "answer": "watches"},
    {"id": "ps-7", "unit_id": "grammar:present-simple-s", "task_class": "controlled_recall", "context_id": "ps-7", "prompt": "The baby ___ a lot. (cry)", "answer": "cries"},
    {"id": "ps-8", "unit_id": "grammar:present-simple-s", "task_class": "controlled_recall", "context_id": "ps-8", "prompt": "We ___ lunch at two. (have)", "answer": "have"}
  ],
};
