import type { UnitData } from "../types.js";

export const UNIT_DATA: UnitData = {
  unit: {
    "id": "grammar:modals-basic",
    "title": "Modals: can / could / should",
    "cefr": "A2",
    "prerequisites": [],
    "summary_en": "Can shows ability or permission; could shows past ability; should gives advice. After a modal use the base verb without to or -s: She can swim. You should see a doctor.",
    "summary_ar": "can للقدرة والسماح، وcould للقدرة في الماضي، وshould للنصيحة. وبعدها الفعل بصيغته الأولى بدون to أو s.",
    "examples": [
      "You should see a doctor.",
      "He can't drive; he is only ten.",
      "I could swim when I was five."
    ],
    "common_mistake_ar": "إضافة to أو s بعد الفعل المساعد (She can to swim / She cans)."
  },
  items: [
    {"id": "md-1", "unit_id": "grammar:modals-basic", "task_class": "recognition_item", "context_id": "md-1", "prompt": "You ___ see a doctor. You look ill.", "options": ["can", "should", "shouldn't"], "answer": "should"},
    {"id": "md-2", "unit_id": "grammar:modals-basic", "task_class": "recognition_item", "context_id": "md-2", "prompt": "I ___ swim when I was five.", "options": ["can", "should", "could"], "answer": "could"},
    {"id": "md-3", "unit_id": "grammar:modals-basic", "task_class": "recognition_item", "context_id": "md-3", "prompt": "___ you help me, please?", "options": ["Should", "Can", "Must"], "answer": "Can"},
    {"id": "md-4", "unit_id": "grammar:modals-basic", "task_class": "recognition_item", "context_id": "md-4", "prompt": "He ___ drive; he is only ten.", "options": ["can", "can't", "should"], "answer": "can't"},
    {"id": "md-5", "unit_id": "grammar:modals-basic", "task_class": "controlled_recall", "context_id": "md-5", "prompt": "You ___ smoke here. It is not allowed. (can/can't)", "answer": "can't", "accepted": ["cant", "cannot"]},
    {"id": "md-6", "unit_id": "grammar:modals-basic", "task_class": "controlled_recall", "context_id": "md-6", "prompt": "I am from Sudan, so I ___ speak Arabic. (can/can't)", "answer": "can"},
    {"id": "md-7", "unit_id": "grammar:modals-basic", "task_class": "controlled_recall", "context_id": "md-7", "prompt": "She ___ study more if she wants to pass. (should/shouldn't)", "answer": "should"},
    {"id": "md-8", "unit_id": "grammar:modals-basic", "task_class": "controlled_recall", "context_id": "md-8", "prompt": "Children ___ play near the road. (should/shouldn't)", "answer": "shouldn't", "accepted": ["shouldnt", "should not"]}
  ],
};
