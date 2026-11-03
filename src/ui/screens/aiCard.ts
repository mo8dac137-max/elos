import type { AiOutcome } from '../../ai/gateway.js';
import { createButton, createCard } from './common.js';

export interface AiCardDeps {
  getSignedIn: () => boolean;
  onTestAi: () => Promise<AiOutcome>;
}

export function createAiCard(deps: AiCardDeps): { element: HTMLElement; refresh: () => void } {
  const card = createCard('ai-card');
  let outcomeText: string | null = null;

  function render(): void {
    card.textContent = '';

    const title = document.createElement('div');
    title.style.fontWeight = 'bold';
    title.textContent = 'AI assistant';
    card.appendChild(title);

    const signedIn = deps.getSignedIn();
    if (!signedIn) {
      const line = document.createElement('div');
      line.className = 'notice-line';
      line.textContent = 'AI features need a sign-in.';
      card.appendChild(line);
      return;
    }

    const desc = document.createElement('div');
    desc.className = 'notice-line';
    desc.textContent =
      'Test the AI connection after setting the gateway key (see docs/ai-gateway-setup.md).';
    card.appendChild(desc);

    const testBtn = createButton('Test AI connection', async () => {
      testBtn.disabled = true;
      testBtn.textContent = 'Testing...';
      try {
        const outcome = await deps.onTestAi();
        if (outcome.status === 'ok') {
          outcomeText =
            'AI ready. Model: ' +
            outcome.model +
            '. Reply: ' +
            outcome.text +
            ' Calls today: ' +
            outcome.callsToday +
            '/' +
            outcome.cap;
        } else if (outcome.status === 'ai_disabled') {
          outcomeText =
            'AI disabled: no key set on the server. The app works fully without AI.';
        } else if (outcome.status === 'daily_cap_reached') {
          outcomeText =
            'Daily AI cap reached (' +
            outcome.usedToday +
            '/' +
            outcome.cap +
            '). Try again tomorrow.';
        } else if (outcome.status === 'offline') {
          outcomeText = 'Offline. AI needs a connection.';
        } else if (outcome.status === 'not_signed_in') {
          outcomeText = 'Please sign in again.';
        } else if (outcome.status === 'error') {
          outcomeText = 'AI error: ' + outcome.message;
        }
        render();
      } finally {
        testBtn.disabled = false;
        testBtn.textContent = 'Test AI connection';
      }
    });
    testBtn.style.marginTop = '8px';
    card.appendChild(testBtn);

    if (outcomeText) {
      const outLine = document.createElement('div');
      outLine.className = 'notice-line';
      outLine.style.marginTop = '8px';
      outLine.textContent = outcomeText;
      card.appendChild(outLine);
    }
  }

  render();

  return {
    element: card,
    refresh: () => {
      render();
    },
  };
}
