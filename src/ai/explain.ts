import { callAi, AiFetch, AiOutcome } from './gateway.js';
import type { AuthSession } from '../sync/auth.js';
import type { CurriculumUnitDef } from '../content/types.js';

/**
 * H2: explain_unit — ask the AI gateway for an Arabic-scaffolded explanation
 * of a curriculum unit. Only public curriculum content leaves the device:
 * no learner state, no answers, no events. The explanation is communication
 * only and never becomes learning evidence (kernel stays the sole authority).
 */
export function explainUnit(
  fetchImpl: AiFetch,
  session: AuthSession | null,
  unit: CurriculumUnitDef
): Promise<AiOutcome> {
  return callAi(fetchImpl, session, 'explain_unit', {
    unit_id: unit.id,
    unit: {
      title: unit.title,
      cefr: unit.cefr,
      summary_en: unit.summary_en,
      summary_ar: unit.summary_ar,
      examples: unit.examples,
      common_mistake_ar: unit.common_mistake_ar,
    },
  });
}
