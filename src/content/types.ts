export type CefrBand = "A1" | "A2" | "B1" | "B2" | "C1";
export type ItemTaskClass = "recognition_item" | "controlled_recall";

export interface CurriculumUnitDef {
  id: string;
  title: string;
  cefr: CefrBand;
  prerequisites: string[];
  summary_en: string;
  summary_ar: string;
  examples: string[];
  common_mistake_ar: string;
}

export interface ItemDef {
  id: string;
  unit_id: string;
  task_class: ItemTaskClass;
  context_id: string;
  prompt: string;
  options?: string[];
  answer: string;
  accepted?: string[];
  note_en?: string;
  /** Which skill this item trains; defaults to 'grammar' (Milestone I1). */
  skill?: 'grammar' | 'vocabulary';
}

export interface GrammarPack {
  units: CurriculumUnitDef[];
  items: ItemDef[];
}

export interface UnitData {
  unit: CurriculumUnitDef;
  items: ItemDef[];
}
