import type { AiOutcome } from '../../ai/gateway.js';
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
  /** I2: the self-loading dictionary section (word units only, else null). */
  dictSection?: HTMLElement | null;
  onBack: () => void;
  onExplainAi: () => Promise<AiOutcome>;
}

/** Maps an AiOutcome to the visible explain-result box (RTL for Arabic text). */
function showExplainOutcome(box: HTMLElement, outcome: AiOutcome): void {
  box.textContent = '';
  if (outcome.status === 'ok') {
    box.appendChild(createRtlBlock(outcome.text));
    return;
  }
  const line = document.createElement('div');
  line.className = 'notice-line';
  if (outcome.status === 'ai_disabled') {
    line.textContent = 'AI disabled: no key set on the server.';
  } else if (outcome.status === 'daily_cap_reached') {
    line.textContent =
      'Daily AI cap reached (' + outcome.usedToday + '/' + outcome.cap + '). Try again tomorrow.';
  } else if (outcome.status === 'offline') {
    line.textContent = 'Offline. AI needs a connection.';
  } else if (outcome.status === 'not_signed_in') {
    line.textContent = 'Please sign in first (on the home screen).';
  } else if (outcome.status === 'error') {
    if (outcome.message === 'bad_task') {
      line.textContent = 'The server needs the updated AI function (redeploy ai-gateway).';
    } else if (outcome.message === 'bad_output') {
      line.textContent = 'The AI response was not valid. Try again.';
    } else {
      line.textContent = 'AI error: ' + outcome.message;
    }
  }
  box.appendChild(line);
}

/** The unit card: summaries, examples, the common-mistake note and the AI explain button. */
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

  if (deps.dictSection) {
    card.appendChild(deps.dictSection);
  }

  card.appendChild(createSectionLabel('AI help'));
  const explainBtn = createButton('Explain with AI (Arabic)', async () => {
    explainBtn.disabled = true;
    explainBtn.textContent = 'Explaining...';
    outcomeBox.textContent = '';
    const waiting = document.createElement('div');
    waiting.className = 'notice-line';
    waiting.textContent = 'Asking the AI for a simple Arabic explanation...';
    outcomeBox.appendChild(waiting);
    try {
      const outcome = await deps.onExplainAi();
      showExplainOutcome(outcomeBox, outcome);
    } finally {
      explainBtn.disabled = false;
      explainBtn.textContent = 'Explain with AI (Arabic)';
    }
  });
  explainBtn.style.marginTop = '8px';
  card.appendChild(explainBtn);

  const outcomeBox = document.createElement('div');
  outcomeBox.style.marginTop = '8px';
  card.appendChild(outcomeBox);

  container.appendChild(card);
  container.appendChild(createButton('Back', deps.onBack, 'btn-primary'));
  root.appendChild(container);
}
