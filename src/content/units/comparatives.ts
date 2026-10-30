import type { UnitData } from "../types.js";

export const UNIT_DATA: UnitData = {
  unit: {
    "id": "grammar:comparatives",
    "title": "Comparatives",
    "cefr": "A2",
    "prerequisites": [],
    "summary_en": "Short adjectives add -er (cheap - cheaper, tall - taller). Double the last consonant after one short vowel (hot - hotter). Change y to ier (easy - easier). Long adjectives use more (more interesting). Then use than.",
    "summary_ar": "الصفات القصيرة تأخذ er، والطويلة تستخدم more. ثم نستخدم than للمقارنة.",
    "examples": [
      "My phone is cheaper than yours.",
      "This book is more interesting than that one."
    ],
    "common_mistake_ar": "الجمع بين الاثنين (more cheaper) أو نسيان than."
  },
  items: [
    {"id": "cp-1", "unit_id": "grammar:comparatives", "task_class": "recognition_item", "context_id": "cp-1", "prompt": "My phone is ___ than yours.", "options": ["cheap", "cheaper", "more cheap"], "answer": "cheaper"},
    {"id": "cp-2", "unit_id": "grammar:comparatives", "task_class": "recognition_item", "context_id": "cp-2", "prompt": "This book is ___ than that one.", "options": ["more interesting", "interestinger", "most interesting"], "answer": "more interesting"},
    {"id": "cp-3", "unit_id": "grammar:comparatives", "task_class": "recognition_item", "context_id": "cp-3", "prompt": "Today is ___ than yesterday.", "options": ["hotter", "hot", "more hot"], "answer": "hotter"},
    {"id": "cp-4", "unit_id": "grammar:comparatives", "task_class": "recognition_item", "context_id": "cp-4", "prompt": "She is ___ than her brother.", "options": ["tall", "tallest", "taller"], "answer": "taller"},
    {"id": "cp-5", "unit_id": "grammar:comparatives", "task_class": "controlled_recall", "context_id": "cp-5", "prompt": "A car is ___ than a bike. (fast)", "answer": "faster"},
    {"id": "cp-6", "unit_id": "grammar:comparatives", "task_class": "controlled_recall", "context_id": "cp-6", "prompt": "This test is ___ than the last one. (easy)", "answer": "easier"},
    {"id": "cp-7", "unit_id": "grammar:comparatives", "task_class": "controlled_recall", "context_id": "cp-7", "prompt": "English is ___ than I thought. (difficult)", "answer": "more difficult"},
    {"id": "cp-8", "unit_id": "grammar:comparatives", "task_class": "controlled_recall", "context_id": "cp-8", "prompt": "My bag is ___ than yours. (heavy)", "answer": "heavier"}
  ],
};
