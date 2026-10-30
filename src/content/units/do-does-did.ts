import type { UnitData } from "../types.js";

export const UNIT_DATA: UnitData = {
  unit: {
    "id": "grammar:do-does-did",
    "title": "Questions and negatives: do / does / did",
    "cefr": "A2",
    "prerequisites": [
      "grammar:present-simple-s"
    ],
    "summary_en": "Use do or does (present) and did (past) to make questions and negatives. After them the main verb stays in its base form: Does she work? She did not go. Use does with he, she, it.",
    "summary_ar": "نستخدم do وdoes في المضارع وdid في الماضي لتكوين السؤال والنفي. وبعدها يبقى الفعل الأصلي بصيغته الأولى: Does she work?",
    "examples": [
      "Where does she work now?",
      "Did you see the film yesterday?",
      "They do not work on Sundays."
    ],
    "common_mistake_ar": "حذف الفعل المساعد (You like coffee?) أو تكرار العلامة (Does she works? وDid you went?)."
  },
  items: [
    {"id": "dd-1", "unit_id": "grammar:do-does-did", "task_class": "recognition_item", "context_id": "dd-1", "prompt": "Where ___ she work now?", "options": ["do", "does", "did"], "answer": "does"},
    {"id": "dd-2", "unit_id": "grammar:do-does-did", "task_class": "recognition_item", "context_id": "dd-2", "prompt": "I ___ not know the answer yesterday.", "options": ["does", "did", "do"], "answer": "did", "note_en": "Yesterday shows the past, so we use did."},
    {"id": "dd-3", "unit_id": "grammar:do-does-did", "task_class": "recognition_item", "context_id": "dd-3", "prompt": "How often ___ your parents call you these days?", "options": ["did", "do", "does"], "answer": "do"},
    {"id": "dd-4", "unit_id": "grammar:do-does-did", "task_class": "recognition_item", "context_id": "dd-4", "prompt": "They ___ not work on Sundays now.", "options": ["do", "does", "did"], "answer": "do"},
    {"id": "dd-5", "unit_id": "grammar:do-does-did", "task_class": "controlled_recall", "context_id": "dd-5", "prompt": "___ he play football every weekend? (do/does/did)", "answer": "does"},
    {"id": "dd-6", "unit_id": "grammar:do-does-did", "task_class": "controlled_recall", "context_id": "dd-6", "prompt": "___ you see the film yesterday? (do/does/did)", "answer": "did"},
    {"id": "dd-7", "unit_id": "grammar:do-does-did", "task_class": "controlled_recall", "context_id": "dd-7", "prompt": "She ___ not eat meat these days. (do/does/did)", "answer": "does"},
    {"id": "dd-8", "unit_id": "grammar:do-does-did", "task_class": "controlled_recall", "context_id": "dd-8", "prompt": "We ___ not go out last night. (do/does/did)", "answer": "did"}
  ],
};
