import type { UnitData } from "../types.js";

export const UNIT_DATA: UnitData = {
  unit: {
    "id": "grammar:articles-the",
    "title": "Articles: the",
    "cefr": "A2",
    "prerequisites": [
      "grammar:articles-a-an"
    ],
    "summary_en": "Use the for something specific or already known (the sun, the cat from before). Use a or an for something new. Use no article for general plurals and uncountable nouns: I like music.",
    "summary_ar": "نستخدم the لشيء محدد أو معروف أو سبق ذكره. ونستخدم a وan لشيء جديد. ولا نضع أداة مع الجمع العام وغير المعدود: I like music.",
    "examples": [
      "I have a cat. The cat is black.",
      "Look at the moon!",
      "I like music."
    ],
    "common_mistake_ar": "نضع the مع كل شيء كما نفعل مع الألف واللام في العربية. لكن الإنجليزية لا تضعها مع المعاني العامة: Life is beautiful."
  },
  items: [
    {"id": "the-1", "unit_id": "grammar:articles-the", "task_class": "recognition_item", "context_id": "the-1", "prompt": "I have a cat. ___ cat is black.", "options": ["a", "the", "no article"], "answer": "the"},
    {"id": "the-2", "unit_id": "grammar:articles-the", "task_class": "recognition_item", "context_id": "the-2", "prompt": "She is ___ doctor.", "options": ["the", "a", "no article"], "answer": "a"},
    {"id": "the-3", "unit_id": "grammar:articles-the", "task_class": "recognition_item", "context_id": "the-3", "prompt": "We can see ___ sun.", "options": ["a", "no article", "the"], "answer": "the"},
    {"id": "the-4", "unit_id": "grammar:articles-the", "task_class": "recognition_item", "context_id": "the-4", "prompt": "I like ___ music.", "options": ["the", "a", "no article"], "answer": "no article", "note_en": "We use no article for general ideas: I like music."},
    {"id": "the-5", "unit_id": "grammar:articles-the", "task_class": "controlled_recall", "context_id": "the-5", "prompt": "Please close ___ door. (a/the)", "answer": "the"},
    {"id": "the-6", "unit_id": "grammar:articles-the", "task_class": "controlled_recall", "context_id": "the-6", "prompt": "My father is ___ pilot. (a/the)", "answer": "a"},
    {"id": "the-7", "unit_id": "grammar:articles-the", "task_class": "controlled_recall", "context_id": "the-7", "prompt": "Look at ___ moon! (a/the)", "answer": "the"},
    {"id": "the-8", "unit_id": "grammar:articles-the", "task_class": "controlled_recall", "context_id": "the-8", "prompt": "She wants to buy ___ new phone. (a/the)", "answer": "a"}
  ],
};
