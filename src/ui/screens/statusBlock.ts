import {
  ClientState,
  deriveFromClient,
  unsyncedCount,
} from '../../kernel/index.js';

const HIGHER_STATES = new Set(['controlled', 'guided', 'spontaneous', 'mastery']);

export interface StatusBlockController {
  element: HTMLElement;
  update: () => void;
}

export function createStatusBlock(
  getState: () => ClientState | null,
  getUnitId: () => string
): StatusBlockController {
  const statusBlock = document.createElement('div');
  statusBlock.className = 'card status-card';

  const unitLine = document.createElement('div');
  unitLine.className = 'unit-label';

  const stateLine = document.createElement('div');
  const unsyncedLine = document.createElement('div');
  const controlledNotice = document.createElement('div');
  controlledNotice.className = 'notice-line';
  controlledNotice.textContent = 'Controlled stage reached';

  statusBlock.appendChild(unitLine);
  statusBlock.appendChild(stateLine);
  statusBlock.appendChild(unsyncedLine);

  function update(): void {
    const state = getState();
    if (!state) return;

    const unitId = getUnitId();
    unitLine.textContent = unitId === 'grammar:go-went-gone' ? 'Grammar: go / went / gone' : unitId;

    const derived = deriveFromClient(state, unitId, { minDelayMs: 86400000 });
    stateLine.textContent = `State: ${derived.state}`;
    unsyncedLine.textContent = `Unsynced events: ${unsyncedCount(state)}`;

    if (HIGHER_STATES.has(derived.state)) {
      if (!controlledNotice.parentElement) {
        statusBlock.appendChild(controlledNotice);
      }
    } else if (controlledNotice.parentElement) {
      statusBlock.removeChild(controlledNotice);
    }
  }

  update();

  return {
    element: statusBlock,
    update,
  };
}
