import { ClientState } from '../../kernel/index.js';
import { buildProgressMap } from '../../app/progress.js';
import {
  createButton,
  createCard,
  createContainer,
  createHeader,
  formatDue,
} from './common.js';

export interface ProgressDeps {
  state: ClientState;
  nowIso: string;
  onBack: () => void;
  onOpenUnit: (unitId: string) => void;
}

/**
 * The progress map: units grouped by CEFR band, each as a card with the
 * title, the derived state and the review status. Tapping a card opens
 * the unit card.
 */
export function renderProgressMap(root: HTMLElement, deps: ProgressDeps): void {
  root.textContent = '';
  const container = createContainer();
  container.appendChild(createHeader('Progress map'));

  const bands = buildProgressMap(deps.state, deps.nowIso);
  for (const band of bands) {
    const bandHeader = document.createElement('div');
    bandHeader.className = 'band-header';
    bandHeader.textContent = band.band;
    container.appendChild(bandHeader);

    for (const unit of band.units) {
      const card = createCard('unit-card-btn');
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');

      const titleEl = document.createElement('div');
      titleEl.className = 'unit-title';
      titleEl.textContent = unit.title;
      card.appendChild(titleEl);

      const stateEl = document.createElement('div');
      stateEl.className = 'due-line';
      stateEl.textContent = `State: ${unit.state}`;
      card.appendChild(stateEl);

      const dueEl = document.createElement('div');
      dueEl.className = 'due-line';
      dueEl.textContent = formatDue(unit.due);
      card.appendChild(dueEl);

      const open = () => deps.onOpenUnit(unit.unit_id);
      card.onclick = open;
      card.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      };
      container.appendChild(card);
    }
  }

  container.appendChild(createButton('Back', deps.onBack, 'btn-primary'));
  root.appendChild(container);
}
