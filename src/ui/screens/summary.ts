import { SessionUnitSummary } from '../../app/session.js';
import { unitTitle } from '../../app/curriculum.js';
import {
  createButton,
  createCard,
  createContainer,
  createHeader,
  formatDueAt,
} from './common.js';

export interface SummaryDeps {
  answered: number;
  correct: number;
  rows: readonly SessionUnitSummary[];
  nowIso: string;
  onHome: () => void;
}

/** The session summary: totals plus one row per unit touched. */
export function renderSummary(root: HTMLElement, deps: SummaryDeps): void {
  root.textContent = '';
  const container = createContainer();
  container.appendChild(createHeader('Session summary'));

  const totalsCard = createCard('totals-card');
  const answeredLine = document.createElement('div');
  answeredLine.textContent = `Answered: ${deps.answered}`;
  totalsCard.appendChild(answeredLine);
  const correctLine = document.createElement('div');
  correctLine.textContent = `Correct: ${deps.correct}`;
  totalsCard.appendChild(correctLine);
  container.appendChild(totalsCard);

  if (deps.rows.length > 0) {
    const rowsCard = createCard('summary-rows-card');
    for (const row of deps.rows) {
      const rowEl = document.createElement('div');
      rowEl.className = 'summary-row';

      const titleEl = document.createElement('div');
      titleEl.className = 'summary-row-title';
      titleEl.textContent = unitTitle(row.unit_id);
      rowEl.appendChild(titleEl);

      const stateEl = document.createElement('div');
      stateEl.className = 'summary-row-state';
      stateEl.textContent = `${row.from} \u2192 ${row.to}`;
      rowEl.appendChild(stateEl);

      const dueEl = document.createElement('div');
      dueEl.className = 'summary-row-due';
      dueEl.textContent = formatDueAt(row.due_at, deps.nowIso);
      rowEl.appendChild(dueEl);

      rowsCard.appendChild(rowEl);
    }
    container.appendChild(rowsCard);
  }

  container.appendChild(createButton('Home', deps.onHome, 'btn-primary'));
  root.appendChild(container);
}
