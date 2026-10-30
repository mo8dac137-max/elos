import type { UnitData } from "../types.js";

export const UNIT_DATA: UnitData = {
  unit: {
    "id": "grammar:prepositions-time",
    "title": "Prepositions of time: at / on / in",
    "cefr": "A2",
    "prerequisites": [],
    "summary_en": "Use at for clock times and night (at six, at night). Use on for days and dates (on Monday). Use in for months, years and parts of the day (in June, in 1998, in the evening).",
    "summary_ar": "at للساعات وat night. on للأيام والتواريخ. in للشهور والسنوات وأجزاء اليوم (in the evening).",
    "examples": [
      "The meeting is on Monday.",
      "I wake up at six o'clock.",
      "She was born in 1998."
    ],
    "common_mistake_ar": "استخدام in لكل شيء بسبب الترجمة من العربية (في). نتذكر: ساعة = at، يوم = on، شهر أو سنة = in."
  },
  items: [
    {"id": "pt-1", "unit_id": "grammar:prepositions-time", "task_class": "recognition_item", "context_id": "pt-1", "prompt": "The meeting is ___ Monday.", "options": ["in", "at", "on"], "answer": "on"},
    {"id": "pt-2", "unit_id": "grammar:prepositions-time", "task_class": "recognition_item", "context_id": "pt-2", "prompt": "I wake up ___ six o'clock.", "options": ["at", "on", "in"], "answer": "at"},
    {"id": "pt-3", "unit_id": "grammar:prepositions-time", "task_class": "recognition_item", "context_id": "pt-3", "prompt": "She was born ___ 1998.", "options": ["on", "at", "in"], "answer": "in"},
    {"id": "pt-4", "unit_id": "grammar:prepositions-time", "task_class": "recognition_item", "context_id": "pt-4", "prompt": "We often go out ___ the evening.", "options": ["in", "on", "at"], "answer": "in"},
    {"id": "pt-5", "unit_id": "grammar:prepositions-time", "task_class": "controlled_recall", "context_id": "pt-5", "prompt": "The shop closes ___ night. (in/on/at)", "answer": "at"},
    {"id": "pt-6", "unit_id": "grammar:prepositions-time", "task_class": "controlled_recall", "context_id": "pt-6", "prompt": "My birthday is ___ June. (in/on/at)", "answer": "in"},
    {"id": "pt-7", "unit_id": "grammar:prepositions-time", "task_class": "controlled_recall", "context_id": "pt-7", "prompt": "I will see you ___ Friday. (in/on/at)", "answer": "on"},
    {"id": "pt-8", "unit_id": "grammar:prepositions-time", "task_class": "controlled_recall", "context_id": "pt-8", "prompt": "The film starts ___ 8:30. (in/on/at)", "answer": "at"}
  ],
};
