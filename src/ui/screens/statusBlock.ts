import {
  ClientState,
  deriveFromClient,
  unsyncedCount,
} from '../../kernel/index.js';
import { unitTitle } from '../../app/curriculum.js';

const HIGHER_STATES = new Set(['controlled', 'guided', 'spontaneous', 'mastery']);

export interface StatusBlockController {
  element: HTMLElement;
  update: () => void;
}

/**
 * The status block: unit title, derived state and the always-visible
 * unsynced-event count. When getUnitId() returns null (Home screen) the
 * unit-specific lines are hidden and only the sync status remains.
 */
export function createStatusBlock(
  getState: () => ClientState | null,
  getUnitId: () => string | null
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
    if (unitId === null) {
      unitLine.style.display = 'none';
      stateLine.style.display = 'none';
    } else {
      unitLine.style.display = '';
      stateLine.style.display = '';
      unitLine.textContent = unitTitle(unitId);

      const derived = deriveFromClient(state, unitId, { minDelayMs: 86400000 });
      stateLine.textContent = `State: ${derived.state}`;

      if (HIGHER_STATES.has(derived.state)) {
        if (!controlledNotice.parentElement) {
          statusBlock.appendChild(controlledNotice);
        }
      } else if (controlledNotice.parentElement) {
        statusBlock.removeChild(controlledNotice);
      }
    }

    unsyncedLine.textContent = `Unsynced events: ${unsyncedCount(state)}`;
  }

  update();

  return {
    element: statusBlock,
    update,
  };
}
