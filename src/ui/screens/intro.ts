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

export interface IntroDeps {
  unitDef: CurriculumUnitDef;
  onStart: () => void;
}

/**
 * The unit intro card, shown when the next task belongs to a unit whose
 * state is "unknown" and that was not shown yet in this session.
 * Arabic appears only in the RTL blocks.
 */
export function renderIntro(root: HTMLElement, deps: IntroDeps): void {
  const { unitDef } = deps;

  root.textContent = '';
  const container = createContainer();
  container.appendChild(createHeader(unitDef.title));

  const card = createCard('intro-card');

  const title = document.createElement('div');
  title.className = 'unit-title';
  title.textContent = unitDef.title;
  card.appendChild(title);

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

  const startBtn = createButton('Start', deps.onStart, 'btn-primary');
  card.appendChild(startBtn);

  container.appendChild(card);
  root.appendChild(container);
}
