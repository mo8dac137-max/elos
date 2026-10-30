import type { UnitData } from "../types.js";

export const UNIT_DATA: UnitData = {
  unit: {
    "id": "grammar:present-perfect-basic",
    "title": "Present perfect: have / has + past participle",
    "cefr": "B1",
    "prerequisites": [
      "grammar:past-simple",
      "grammar:go-went-gone"
    ],
    "summary_en": "Use have or has + past participle for an experience, or for a situation that started in the past and continues now (for, since). Do not use it with finished times like yesterday: I have lived here for five years. She has already finished.",
    "summary_ar": "have أو has + التصريف الثالث للتعبير عن خبرة أو حالة بدأت في الماضي وما زالت مستمرة (for وsince). ولا نستخدمه مع وقت منتهي مثل yesterday.",
    "examples": [
      "I have lived here for five years.",
      "She has already finished her homework.",
      "We have seen this film before."
    ],
    "common_mistake_ar": "استخدام الماضي البسيط مكانه أو العكس، مثل: I have seen him yesterday (خطأ)."
  },
  items: [
    {"id": "pp-1", "unit_id": "grammar:present-perfect-basic", "task_class": "recognition_item", "context_id": "pp-1", "prompt": "I ___ lived here for five years.", "options": ["has", "have", "did"], "answer": "have"},
    {"id": "pp-2", "unit_id": "grammar:present-perfect-basic", "task_class": "recognition_item", "context_id": "pp-2", "prompt": "She ___ already finished her homework.", "options": ["have", "has", "did"], "answer": "has"},
    {"id": "pp-3", "unit_id": "grammar:present-perfect-basic", "task_class": "recognition_item", "context_id": "pp-3", "prompt": "We have ___ this film before.", "options": ["saw", "see", "seen"], "answer": "seen"},
    {"id": "pp-4", "unit_id": "grammar:present-perfect-basic", "task_class": "recognition_item", "context_id": "pp-4", "prompt": "He has ___ in Cairo since 2020.", "options": ["lives", "living", "lived"], "answer": "lived"},
    {"id": "pp-5", "unit_id": "grammar:present-perfect-basic", "task_class": "controlled_recall", "context_id": "pp-5", "prompt": "They ___ never visited Sudan. (have/has)", "answer": "have"},
    {"id": "pp-6", "unit_id": "grammar:present-perfect-basic", "task_class": "controlled_recall", "context_id": "pp-6", "prompt": "I have ___ my keys. (lose)", "answer": "lost"},
    {"id": "pp-7", "unit_id": "grammar:present-perfect-basic", "task_class": "controlled_recall", "context_id": "pp-7", "prompt": "She has ___ three cups of tea today. (drink)", "answer": "drunk"},
    {"id": "pp-8", "unit_id": "grammar:present-perfect-basic", "task_class": "controlled_recall", "context_id": "pp-8", "prompt": "We have just ___ dinner. (eat)", "answer": "eaten"}
  ],
};
