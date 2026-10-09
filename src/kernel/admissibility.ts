import { validateEvent } from './index.js';
import type {
  EvidenceEvent,
  Evaluator,
  EvaluatorType,
  TaskClass,
  Modality,
  Result,
} from './index.js';

export interface Finding {
  span: string;
  category: string;
  polarity: 'error' | 'ok';
}

export interface CandidateAssessment {
  candidate_id: string;
  evaluator: Evaluator;
  task_class: TaskClass;
  claim_type: string;
  unit_refs: string[];
  skill: string;
  modality: Modality;
  context_id: string;
  occurred_at: string;
  recorded_at: string;
  learner_text: string;
  findings: Finding[];
  overall_result: Result;
  self_confidence: 'low' | 'normal';
}

export interface EvaluatorApproval {
  evaluator_type: EvaluatorType;
  evaluator_id: string;
  evaluator_version: string;
  task_class: TaskClass;
  claim_type: string;
  reliability_cap: 'usable' | 'low';
}

export interface AssistanceExposure {
  kind: 'hint' | 'translation' | 'completion' | 'reformulation' | 'rescue';
}

export interface TaskContext {
  task_class: TaskClass;
  exposures: AssistanceExposure[];
}

export interface AdmissibilityInput {
  candidate: CandidateAssessment;
  task: TaskContext;
  registry: EvaluatorApproval[];
  taxonomy: string[];
  corroborated_by_deterministic_check: boolean;
  new_event_id: string;
}

export type AdmissibilityOutcome =
  | { outcome: 'admissible_event'; event: EvidenceEvent; downgraded: boolean }
  | { outcome: 'candidate_concern'; evaluator_key: string; unit_refs: string[] }
  | { outcome: 'not_assessable'; reasons: string[] };

const VALID_EVALUATOR_TYPES = ['deterministic', 'llm', 'human', 'owner'] as const;
const VALID_TASK_CLASSES = [
  'recognition_item',
  'controlled_recall',
  'guided_production',
  'independent_production',
] as const;
const VALID_MODALITIES = [
  'receptive_written',
  'receptive_spoken',
  'productive_written',
  'productive_spoken',
] as const;
const VALID_RESULTS = ['correct', 'partial', 'incorrect', 'not_assessable'] as const;

function checkShape(input: unknown): input is AdmissibilityInput {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return false;
  }
  const inp = input as Record<string, unknown>;

  if (typeof inp.new_event_id !== 'string') return false;
  if (!Array.isArray(inp.registry)) return false;
  if (!Array.isArray(inp.taxonomy)) return false;
  if (typeof inp.corroborated_by_deterministic_check !== 'boolean') return false;

  const t = inp.task;
  if (typeof t !== 'object' || t === null || Array.isArray(t)) return false;
  const task = t as Record<string, unknown>;
  if (!VALID_TASK_CLASSES.includes(task.task_class as TaskClass)) return false;
  if (!Array.isArray(task.exposures)) return false;

  const c = inp.candidate;
  if (typeof c !== 'object' || c === null || Array.isArray(c)) return false;
  const cand = c as Record<string, unknown>;

  if (typeof cand.candidate_id !== 'string') return false;
  if (typeof cand.claim_type !== 'string') return false;
  if (typeof cand.skill !== 'string') return false;
  if (typeof cand.context_id !== 'string') return false;
  if (typeof cand.occurred_at !== 'string') return false;
  if (typeof cand.recorded_at !== 'string') return false;
  if (typeof cand.learner_text !== 'string') return false;

  const ev = cand.evaluator;
  if (typeof ev !== 'object' || ev === null || Array.isArray(ev)) return false;
  const evaluator = ev as Record<string, unknown>;
  if (!VALID_EVALUATOR_TYPES.includes(evaluator.type as EvaluatorType)) return false;
  if (typeof evaluator.id !== 'string') return false;
  if (typeof evaluator.version !== 'string') return false;

  if (!VALID_TASK_CLASSES.includes(cand.task_class as TaskClass)) return false;
  if (!VALID_MODALITIES.includes(cand.modality as Modality)) return false;

  if (!Array.isArray(cand.unit_refs)) return false;

  if (!VALID_RESULTS.includes(cand.overall_result as Result)) return false;
  if (cand.self_confidence !== 'low' && cand.self_confidence !== 'normal') return false;

  if (!Array.isArray(cand.findings)) return false;
  for (const f of cand.findings) {
    if (typeof f !== 'object' || f === null || Array.isArray(f)) return false;
    const fin = f as Record<string, unknown>;
    if (typeof fin.span !== 'string') return false;
    if (typeof fin.category !== 'string') return false;
    if (fin.polarity !== 'error' && fin.polarity !== 'ok') return false;
  }

  return true;
}

export function assessAdmissibility(input: AdmissibilityInput): AdmissibilityOutcome {
  try {
    if (!checkShape(input)) {
      return {
        outcome: 'not_assessable',
        reasons: ['candidate_invalid'],
      };
    }

    if (input.candidate.task_class !== input.task.task_class) {
      return {
        outcome: 'not_assessable',
        reasons: ['task_class_mismatch'],
      };
    }

    const approval = input.registry.find(
      app =>
        app.evaluator_type === input.candidate.evaluator.type &&
        app.evaluator_id === input.candidate.evaluator.id &&
        app.evaluator_version === input.candidate.evaluator.version &&
        app.task_class === input.task.task_class &&
        app.claim_type === input.candidate.claim_type
    );

    if (!approval) {
      return {
        outcome: 'not_assessable',
        reasons: ['evaluator_not_approved'],
      };
    }

    const allSpansGrounded = input.candidate.findings.every(
      f => f.span.trim() !== '' && input.candidate.learner_text.includes(f.span)
    );
    if (!allSpansGrounded) {
      return {
        outcome: 'not_assessable',
        reasons: ['span_not_grounded'],
      };
    }

    const allCategoriesInTaxonomy = input.candidate.findings.every(f =>
      input.taxonomy.includes(f.category)
    );
    if (!allCategoriesInTaxonomy) {
      return {
        outcome: 'not_assessable',
        reasons: ['category_not_in_taxonomy'],
      };
    }

    if (input.candidate.overall_result === 'not_assessable') {
      return {
        outcome: 'not_assessable',
        reasons: ['evaluator_declined'],
      };
    }

    if (
      input.candidate.overall_result === 'correct' &&
      input.candidate.findings.some(f => f.polarity === 'error')
    ) {
      return {
        outcome: 'not_assessable',
        reasons: ['result_findings_conflict'],
      };
    }

    if (
      input.candidate.evaluator.type === 'llm' &&
      (input.candidate.overall_result === 'incorrect' ||
        input.candidate.overall_result === 'partial')
    ) {
      const hasErrorFinding = input.candidate.findings.some(f => f.polarity === 'error');
      if (!hasErrorFinding) {
        return {
          outcome: 'not_assessable',
          reasons: ['negative_without_error_finding'],
        };
      }
    }

    if (
      input.candidate.evaluator.type === 'llm' &&
      input.candidate.overall_result === 'incorrect' &&
      !input.corroborated_by_deterministic_check
    ) {
      const evaluator_key = `${input.candidate.evaluator.type}:${input.candidate.evaluator.id}:${input.candidate.evaluator.version}`;
      return {
        outcome: 'candidate_concern',
        evaluator_key,
        unit_refs: [...input.candidate.unit_refs],
      };
    }

    let reliability: 'usable' | 'low' = approval.reliability_cap;
    if (input.candidate.self_confidence === 'low') {
      reliability = 'low';
    }

    let finalTaskClass: TaskClass = input.task.task_class;
    let downgraded = false;

    if (
      input.task.exposures.length > 0 &&
      input.task.task_class === 'independent_production'
    ) {
      finalTaskClass = 'guided_production';
      downgraded = true;
    }

    const event: EvidenceEvent = {
      event_id: input.new_event_id,
      payload_type: 'item_response',
      payload_version: 1,
      payload: {
        item_id: input.candidate.candidate_id,
        response: input.candidate.learner_text,
      },
      occurred_at: input.candidate.occurred_at,
      recorded_at: input.candidate.recorded_at,
      unit_refs: [...input.candidate.unit_refs],
      skill: input.candidate.skill,
      modality: input.candidate.modality,
      task_class: finalTaskClass,
      context_id: input.candidate.context_id,
      evaluator: { ...input.candidate.evaluator },
      reliability,
      result: input.candidate.overall_result,
    };

    const val = validateEvent(event);
    if (!val.ok) {
      return {
        outcome: 'not_assessable',
        reasons: ['event_invalid', ...(val.errors || [])],
      };
    }

    return {
      outcome: 'admissible_event',
      event,
      downgraded,
    };
  } catch {
    return {
      outcome: 'not_assessable',
      reasons: ['candidate_invalid'],
    };
  }
}
