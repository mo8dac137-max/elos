import type { UnitData } from "../types.js";

export const UNIT_DATA: UnitData = {
  unit: {
    "id": "grammar:go-went-gone",
    "title": "go / went / gone",
    "cefr": "A2",
    "prerequisites": [
      "grammar:past-simple"
    ],
    "summary_en": "go - went - gone. Use went for a finished past action (I went there yesterday). Use gone after have or has (She has gone home).",
    "summary_ar": "go ثم went ثم gone. نستخدم went للماضي المنتهي مع وقت، ونستخدم gone بعد have وhas.",
    "examples": [
      "I went to school by bus yesterday.",
      "She has already gone home."
    ],
    "common_mistake_ar": "الخلط بين went وgone مثل: I have went there. الصحيح: I have gone there أو I went there."
  },
  items: [
    {"id": "r1", "unit_id": "grammar:go-went-gone", "task_class": "recognition_item", "context_id": "home", "prompt": "She has already ___ home.", "options": ["went", "gone", "go"], "answer": "gone"},
    {"id": "r2", "unit_id": "grammar:go-went-gone", "task_class": "recognition_item", "context_id": "market", "prompt": "Yesterday we ___ to the market.", "options": ["gone", "went", "go"], "answer": "went"},
    {"id": "r3", "unit_id": "grammar:go-went-gone", "task_class": "recognition_item", "context_id": "school", "prompt": "They have ___ to school.", "options": ["went", "gone", "go"], "answer": "gone"},
    {"id": "r4", "unit_id": "grammar:go-went-gone", "task_class": "recognition_item", "context_id": "gym", "prompt": "Last week I ___ to the gym every morning.", "options": ["go", "went", "gone"], "answer": "went"},
    {"id": "c1", "unit_id": "grammar:go-went-gone", "task_class": "controlled_recall", "context_id": "out", "prompt": "He has ___ out. (go)", "answer": "gone"},
    {"id": "c2", "unit_id": "grammar:go-went-gone", "task_class": "controlled_recall", "context_id": "night", "prompt": "Last night I ___ to bed early. (go)", "answer": "went"},
    {"id": "c3", "unit_id": "grammar:go-went-gone", "task_class": "controlled_recall", "context_id": "work", "prompt": "My brother has ___ to work. (go)", "answer": "gone"},
    {"id": "c4", "unit_id": "grammar:go-went-gone", "task_class": "controlled_recall", "context_id": "bus", "prompt": "I ___ to school by bus yesterday. (go)", "answer": "went"}
  ],
};
