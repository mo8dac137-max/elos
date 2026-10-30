import type { UnitData } from "../types.js";

export const UNIT_DATA: UnitData = {
  unit: {
    "id": "grammar:articles-a-an",
    "title": "Articles: a / an",
    "cefr": "A1",
    "prerequisites": [],
    "summary_en": "Use a before a consonant sound and an before a vowel sound. It depends on the sound, not the spelling: an hour, a university.",
    "summary_ar": "نستخدم a قبل صوت ساكن وan قبل صوت متحرك. المهم هو النطق وليس الإملاء: an hour وa university.",
    "examples": [
      "She is an engineer.",
      "I bought a book.",
      "He waited for an hour."
    ],
    "common_mistake_ar": "العربية ليس فيها أداة نكرة، فنتجاهل a وan. في الإنجليزية نضعها قبل الاسم المفرد المعدود: I have a car."
  },
  items: [
    {"id": "aan-1", "unit_id": "grammar:articles-a-an", "task_class": "recognition_item", "context_id": "aan-1", "prompt": "She is ___ engineer.", "options": ["a", "an"], "answer": "an"},
    {"id": "aan-2", "unit_id": "grammar:articles-a-an", "task_class": "recognition_item", "context_id": "aan-2", "prompt": "I bought ___ book yesterday.", "options": ["a", "an"], "answer": "a"},
    {"id": "aan-3", "unit_id": "grammar:articles-a-an", "task_class": "recognition_item", "context_id": "aan-3", "prompt": "He waited for ___ hour.", "options": ["a", "an"], "answer": "an", "note_en": "Hour starts with a vowel sound (the h is silent), so we use an."},
    {"id": "aan-4", "unit_id": "grammar:articles-a-an", "task_class": "recognition_item", "context_id": "aan-4", "prompt": "It is ___ university.", "options": ["an", "a"], "answer": "a", "note_en": "University starts with a 'yoo' sound, so we use a."},
    {"id": "aan-5", "unit_id": "grammar:articles-a-an", "task_class": "controlled_recall", "context_id": "aan-5", "prompt": "I need ___ umbrella. (a/an)", "answer": "an"},
    {"id": "aan-6", "unit_id": "grammar:articles-a-an", "task_class": "controlled_recall", "context_id": "aan-6", "prompt": "My brother has ___ new car. (a/an)", "answer": "a"},
    {"id": "aan-7", "unit_id": "grammar:articles-a-an", "task_class": "controlled_recall", "context_id": "aan-7", "prompt": "She ate ___ orange. (a/an)", "answer": "an"},
    {"id": "aan-8", "unit_id": "grammar:articles-a-an", "task_class": "controlled_recall", "context_id": "aan-8", "prompt": "He is ___ honest man. (a/an)", "answer": "an", "note_en": "Honest starts with a vowel sound (the h is silent)."}
  ],
};
