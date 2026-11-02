import type { CurriculumUnitDef } from '../../content/types.js';
import {
  createButton,
  createCard,
  createContainer,
  createExampleList,
  createHeader,
  createRtlBlock,
  createSectionLabel,
} from './common.js';

export interface UnitCardDeps {
  unitDef: CurriculumUnitDef;
  stateLabel: string;
  onBack: () => void;
}

/** The unit card: summaries, examples and the common-mistake note. */
export function renderUnitCard(root: HTMLElement, deps: UnitCardDeps): void {
  const { unitDef } = deps;

  root.textContent = '';
  const container = createContainer();
  container.appendChild(createHeader(unitDef.title));

  const card = createCard('unit-detail-card');

  const stateEl = document.createElement('div');
  stateEl.className = 'due-line';
  stateEl.textContent = `State: ${deps.stateLabel}`;
  card.appendChild(stateEl);

  card.appendChild(createSectionLabel('Rule'));
  const summaryEn = document.createElement('div');
  summaryEn.className = 'summary-en';
  summaryEn.textContent = unitDef.summary_en;
  card.appendChild(summaryEn);

  card.appendChild(createSectionLabel('In Arabic'));
  card.appendChild(createRtlBlock(unitDef.summary_ar));

  card.appendChild(createSectionLabel('Examples'));
  card.appendChild(createExampleList(unitDef.examples));

  card.appendChild(createSectionLabel('Common mistake'));
  card.appendChild(createRtlBlock(unitDef.common_mistake_ar));

  container.appendChild(card);
  container.appendChild(createButton('Back', deps.onBack, 'btn-primary'));
  root.appendChild(container);
}
