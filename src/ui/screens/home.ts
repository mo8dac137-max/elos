import {
  ClientState,
  activeEvents,
  deriveFromClient,
  deriveReviewInfo,
  planSession,
} from '../../kernel/index.js';
import { CURRICULUM, PLANNER_CONFIG, unitTitle } from '../../app/curriculum.js';
import {
  createButton,
  createCard,
  createContainer,
  createHeader,
  SESSION_SIZES,
  getStoredSessionSize,
  storeSessionSize,
} from './common.js';

export interface HomeDeps {
  state: ClientState;
  nowIso: string;
  statusElement: HTMLElement;
  syncBarElement: HTMLElement;
  backupButton: HTMLElement;
  installElement: HTMLElement;
  onStartSession: (size: number) => void;
  onOpenProgress: () => void;
}

export function renderHome(root: HTMLElement, deps: HomeDeps): void {
  const { state, nowIso } = deps;

  root.textContent = '';
  const container = createContainer();
  container.appendChild(createHeader('Today'));
  container.appendChild(deps.statusElement);
  container.appendChild(deps.syncBarElement);

  const events = activeEvents(state);
  const nowMs = Date.parse(nowIso);

  // Count units whose review is due right now.
  let dueCount = 0;
  for (const unit of CURRICULUM) {
    const derived = deriveFromClient(state, unit.id, PLANNER_CONFIG.derive);
    if (derived.state === 'unknown') continue;
    const info = deriveReviewInfo(unit.id, events, PLANNER_CONFIG.review);
    if (info.due_at !== null && Date.parse(info.due_at) <= nowMs) {
      dueCount += 1;
    }
  }

  // Preview the plan to find the next new unit (same planner, one task).
  const preview = planSession(CURRICULUM, events, nowIso, {
    ...PLANNER_CONFIG,
    session_size: 1,
  });
  const firstNewTask = preview.find((t) => t.tier === 'new_unit');
  const hasTasks = preview.length > 0;

  const planCard = createCard('plan-card');
  const dueLine = document.createElement('div');
  dueLine.textContent = `Reviews due: ${dueCount}`;
  planCard.appendChild(dueLine);

  const nextLine = document.createElement('div');
  nextLine.className = 'plan-line';
  nextLine.textContent = firstNewTask
    ? `Next new unit: ${unitTitle(firstNewTask.unit_id)}`
    : 'All caught up';
  planCard.appendChild(nextLine);
  container.appendChild(planCard);

  if (!hasTasks) {
    const emptyCard = createCard();
    const emptyLine = document.createElement('div');
    emptyLine.textContent = 'Nothing to practise right now. Come back later.';
    emptyCard.appendChild(emptyLine);
    container.appendChild(emptyCard);

    container.appendChild(
      createButton('Progress map', deps.onOpenProgress, 'btn-primary')
    );
    container.appendChild(deps.backupButton);
    container.appendChild(deps.installElement);
    root.appendChild(container);
    return;
  }

  // Session-length selector: a UI preference only, never learning data.
  const sizeCard = createCard('size-card');
  const sizeRow = document.createElement('div');
  sizeRow.className = 'size-row';
  let selectedSize = getStoredSessionSize();
  for (const size of SESSION_SIZES) {
    const sizeBtn = document.createElement('button');
    sizeBtn.className =
      'btn size-btn' + (size === selectedSize ? ' selected' : '');
    sizeBtn.textContent = String(size);
    sizeBtn.onclick = () => {
      selectedSize = size;
      storeSessionSize(size);
      for (const other of sizeRow.querySelectorAll('.size-btn')) {
        other.classList.remove('selected');
      }
      sizeBtn.classList.add('selected');
    };
    sizeRow.appendChild(sizeBtn);
  }
  sizeCard.appendChild(sizeRow);
  container.appendChild(sizeCard);

  container.appendChild(
    createButton('Start session', () => deps.onStartSession(selectedSize), 'btn-primary')
  );
  container.appendChild(createButton('Progress map', deps.onOpenProgress));
  container.appendChild(deps.backupButton);
  container.appendChild(deps.installElement);

  root.appendChild(container);
}
