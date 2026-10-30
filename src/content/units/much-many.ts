import type { UnitData } from "../types.js";

export const UNIT_DATA: UnitData = {
  unit: {
    "id": "grammar:much-many",
    "title": "much / many",
    "cefr": "A2",
    "prerequisites": [],
    "summary_en": "Use many with countable nouns (many books). Use much with uncountable nouns (much water, much time). Much is common in questions and negatives.",
    "summary_ar": "many مع المعدود (books)، وmuch مع غير المعدود (water وtime). much تأتي غالبًا في الأسئلة والنفي.",
    "examples": [
      "How many books do you have?",
      "I don't have much time."
    ],
    "common_mistake_ar": "استخدام much مع الأشياء المعدودة (much students). الصحيح many students."
  },
  items: [
    {"id": "mm-1", "unit_id": "grammar:much-many", "task_class": "recognition_item", "context_id": "mm-1", "prompt": "How ___ water do you drink?", "options": ["many", "much"], "answer": "much"},
    {"id": "mm-2", "unit_id": "grammar:much-many", "task_class": "recognition_item", "context_id": "mm-2", "prompt": "How ___ books do you have?", "options": ["much", "many"], "answer": "many"},
    {"id": "mm-3", "unit_id": "grammar:much-many", "task_class": "recognition_item", "context_id": "mm-3", "prompt": "There aren't ___ chairs in the room.", "options": ["many", "much"], "answer": "many"},
    {"id": "mm-4", "unit_id": "grammar:much-many", "task_class": "recognition_item", "context_id": "mm-4", "prompt": "I don't have ___ time.", "options": ["many", "much"], "answer": "much"},
    {"id": "mm-5", "unit_id": "grammar:much-many", "task_class": "controlled_recall", "context_id": "mm-5", "prompt": "How ___ students are in your class? (much/many)", "answer": "many"},
    {"id": "mm-6", "unit_id": "grammar:much-many", "task_class": "controlled_recall", "context_id": "mm-6", "prompt": "She doesn't eat ___ rice. (much/many)", "answer": "much"},
    {"id": "mm-7", "unit_id": "grammar:much-many", "task_class": "controlled_recall", "context_id": "mm-7", "prompt": "How ___ money do you need? (much/many)", "answer": "much"},
    {"id": "mm-8", "unit_id": "grammar:much-many", "task_class": "controlled_recall", "context_id": "mm-8", "prompt": "We didn't see ___ people there. (much/many)", "answer": "many"}
  ],
};
