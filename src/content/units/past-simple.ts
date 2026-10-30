import type { UnitData } from "../types.js";

export const UNIT_DATA: UnitData = {
  unit: {
    "id": "grammar:past-simple",
    "title": "Past simple",
    "cefr": "A2",
    "prerequisites": [
      "grammar:present-simple-s"
    ],
    "summary_en": "Regular verbs add -ed: watched, lived. Irregular verbs change: eat - ate, write - wrote, take - took, buy - bought. Use the past simple for finished actions with a time: yesterday, last week, in 2019.",
    "summary_ar": "الأفعال المنتظمة تأخذ ed. وغير المنتظمة تتغير (eat - ate وwrite - wrote). نستخدم الماضي البسيط لفعل انتهى مع وقت محدد.",
    "examples": [
      "We watched a film last night.",
      "She wrote a letter last week.",
      "He lost his keys yesterday."
    ],
    "common_mistake_ar": "إضافة ed للأفعال الشاذة (buyed) أو نسيان الماضي مع yesterday."
  },
  items: [
    {"id": "pa-1", "unit_id": "grammar:past-simple", "task_class": "recognition_item", "context_id": "pa-1", "prompt": "We ___ a film last night.", "options": ["watch", "watched", "watching"], "answer": "watched"},
    {"id": "pa-2", "unit_id": "grammar:past-simple", "task_class": "recognition_item", "context_id": "pa-2", "prompt": "He ___ his keys yesterday.", "options": ["lost", "lose", "losed"], "answer": "lost"},
    {"id": "pa-3", "unit_id": "grammar:past-simple", "task_class": "recognition_item", "context_id": "pa-3", "prompt": "I ___ breakfast at seven this morning.", "options": ["eat", "eaten", "ate"], "answer": "ate"},
    {"id": "pa-4", "unit_id": "grammar:past-simple", "task_class": "recognition_item", "context_id": "pa-4", "prompt": "They ___ in London in 2019.", "options": ["lives", "lived", "live"], "answer": "lived"},
    {"id": "pa-5", "unit_id": "grammar:past-simple", "task_class": "controlled_recall", "context_id": "pa-5", "prompt": "She ___ a letter last week. (write)", "answer": "wrote"},
    {"id": "pa-6", "unit_id": "grammar:past-simple", "task_class": "controlled_recall", "context_id": "pa-6", "prompt": "I ___ the bus yesterday. (take)", "answer": "took"},
    {"id": "pa-7", "unit_id": "grammar:past-simple", "task_class": "controlled_recall", "context_id": "pa-7", "prompt": "We ___ pizza on Friday. (buy)", "answer": "bought"},
    {"id": "pa-8", "unit_id": "grammar:past-simple", "task_class": "controlled_recall", "context_id": "pa-8", "prompt": "He ___ the door and left. (close)", "answer": "closed"}
  ],
};
