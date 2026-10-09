import {
  createClient,
  deriveFromClient,
  unsyncedCount,
  ClientState,
} from '../kernel/index.js';
import {
  EXERCISE_BANK,
  Exercise,
  pickNextItem,
  submitAnswer,
  serializeState,
} from '../app/index.js';
import { IndexedDbClientStore } from './indexedDbStore.js';

const UNIT_ID = 'grammar:go-went-gone';
const store = new IndexedDbClientStore();

let currentState: ClientState | null = null;
let currentExercise: Exercise | null = null;
let lastAnsweredId: string | null = null;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;
let onInstallPromptChange: (() => void) | null = null;

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredInstallPrompt = e as BeforeInstallPromptEvent;
    if (onInstallPromptChange) {
      onInstallPromptChange();
    }
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    if (onInstallPromptChange) {
      onInstallPromptChange();
    }
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // SW registration failure ignored gracefully
      });
    });
  }
}

function generateId(): string {
  return 'ev-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
}

function getContext() {
  return {
    now: () => new Date().toISOString(),
    newId: generateId,
  };
}

const HIGHER_STATES = new Set(['controlled', 'guided', 'spontaneous', 'mastery']);

async function copyText(
  text: string,
  hostContainer: HTMLElement,
  btn: HTMLButtonElement,
  successText: string
): Promise<void> {
  let failed = false;
  try {
    if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
      failed = true;
    } else {
      await navigator.clipboard.writeText(text);
      const original = btn.textContent;
      btn.textContent = successText;
      setTimeout(() => {
        btn.textContent = original;
      }, 2000);
    }
  } catch {
    failed = true;
  }

  if (failed) {
    let fallback = hostContainer.querySelector<HTMLElement>('.clipboard-fallback');
    if (!fallback) {
      fallback = document.createElement('div');
      fallback.className = 'clipboard-fallback';
      hostContainer.appendChild(fallback);
    }
    fallback.textContent = '';

    const notice = document.createElement('p');
    notice.className = 'notice-line';
    notice.textContent = 'Copy failed. Select and copy manually:';

    const ta = document.createElement('textarea');
    ta.className = 'text-input';
    ta.readOnly = true;
    ta.value = text;
    ta.rows = 4;

    fallback.appendChild(notice);
    fallback.appendChild(ta);
    ta.focus();
    ta.select();
  }
}

function renderCorruptScreen(root: HTMLElement, raw: string): void {
  root.textContent = '';

  const container = document.createElement('div');
  container.className = 'container';

  const heading = document.createElement('h1');
  heading.textContent = 'ELOS';

  const unitLabel = document.createElement('div');
  unitLabel.className = 'unit-label';
  unitLabel.textContent = 'go / went / gone';

  const msg = document.createElement('p');
  msg.className = 'error-text';
  msg.textContent = 'Stored data is unreadable';

  const copyBtn = document.createElement('button');
  copyBtn.className = 'btn';
  copyBtn.textContent = 'Copy unreadable data';
  copyBtn.onclick = () => {
    copyText(raw, container, copyBtn, 'Copied to clipboard');
  };

  container.appendChild(heading);
  container.appendChild(unitLabel);
  container.appendChild(msg);
  container.appendChild(copyBtn);
  root.appendChild(container);
}

function renderApp(root: HTMLElement): void {
  if (!currentState) return;

  root.textContent = '';

  const container = document.createElement('div');
  container.className = 'container';

  const header = document.createElement('header');
  const heading = document.createElement('h1');
  heading.textContent = 'ELOS';
  const unitLabel = document.createElement('div');
  unitLabel.className = 'unit-label';
  unitLabel.textContent = 'go / went / gone';
  header.appendChild(heading);
  header.appendChild(unitLabel);
  container.appendChild(header);

  // Status block
  // minDelayMs: 86400000 is a placeholder HYPOTHESIS
  const statusBlock = document.createElement('div');
  statusBlock.className = 'card status-card';

  const stateLine = document.createElement('div');
  const unsyncedLine = document.createElement('div');
  const controlledNotice = document.createElement('div');
  controlledNotice.className = 'notice-line';
  controlledNotice.textContent = 'This slice only reaches Controlled';

  function updateStatusBlock(): void {
    if (!currentState) return;
    const derived = deriveFromClient(currentState, UNIT_ID, { minDelayMs: 86400000 });
    stateLine.textContent = `State: ${derived.state}`;
    unsyncedLine.textContent = `Unsynced events: ${unsyncedCount(currentState)}`;

    if (HIGHER_STATES.has(derived.state)) {
      if (!controlledNotice.parentElement) {
        statusBlock.appendChild(controlledNotice);
      }
    } else if (controlledNotice.parentElement) {
      statusBlock.removeChild(controlledNotice);
    }
  }

  statusBlock.appendChild(stateLine);
  statusBlock.appendChild(unsyncedLine);
  updateStatusBlock();
  container.appendChild(statusBlock);

  // Error display area (for persistence errors)
  const errorContainer = document.createElement('div');
  errorContainer.id = 'error-area';
  errorContainer.className = 'error-area';
  container.appendChild(errorContainer);

  // Exercise card
  if (!currentExercise) {
    currentExercise = pickNextItem(currentState, EXERCISE_BANK, lastAnsweredId);
  }
  const exercise = currentExercise;

  const card = document.createElement('div');
  card.className = 'card exercise-card';

  const promptEl = document.createElement('div');
  promptEl.className = 'prompt-text';
  promptEl.textContent = exercise.prompt;
  card.appendChild(promptEl);

  const interactionArea = document.createElement('div');
  interactionArea.className = 'interaction-area';

  let hasSubmitted = false;

  function showFeedback(submitResult: { correct: boolean }): void {
    interactionArea.textContent = '';

    const feedback = document.createElement('div');
    feedback.className = submitResult.correct ? 'feedback-correct' : 'feedback-incorrect';
    feedback.textContent = submitResult.correct ? 'Correct' : 'Not quite';
    interactionArea.appendChild(feedback);

    const answerInfo = document.createElement('div');
    answerInfo.className = 'answer-info';
    answerInfo.textContent = `Answer: ${exercise.answer}`;
    interactionArea.appendChild(answerInfo);

    const nextBtn = document.createElement('button');
    nextBtn.className = 'btn btn-primary';
    nextBtn.textContent = 'Next';
    nextBtn.onclick = () => {
      currentExercise = pickNextItem(currentState!, EXERCISE_BANK, lastAnsweredId);
      renderApp(root);
    };
    interactionArea.appendChild(nextBtn);
    nextBtn.focus();
  }

  async function handleResponse(responseStr: string): Promise<void> {
    if (hasSubmitted || !currentState) return;
    hasSubmitted = true;

    // Build event and advance state
    let submitResult: { state: ClientState; correct: boolean };
    try {
      submitResult = submitAnswer(currentState, exercise, responseStr, getContext());
    } catch (err) {
      errorContainer.textContent = `Error recording event: ${err instanceof Error ? err.message : String(err)}`;
      errorContainer.style.display = 'block';
      return;
    }

    // Keep in-memory state
    currentState = submitResult.state;
    lastAnsweredId = exercise.id;

    async function attemptSave(): Promise<void> {
      try {
        await store.save(currentState!);
        // On success: hide error, refresh status block immediately, continue to feedback and Next
        errorContainer.textContent = '';
        errorContainer.style.display = 'none';
        updateStatusBlock();
        showFeedback(submitResult);
      } catch (saveErr) {
        // Failed save: keep in-memory state, show visible error plus "Retry save" button
        errorContainer.textContent = '';
        errorContainer.style.display = 'block';

        const errMsg = document.createElement('div');
        errMsg.className = 'error-text';
        errMsg.textContent = `Save failed: ${saveErr instanceof Error ? saveErr.message : String(saveErr)}`;
        errorContainer.appendChild(errMsg);

        const retryBtn = document.createElement('button');
        retryBtn.className = 'btn';
        retryBtn.style.marginTop = '8px';
        retryBtn.textContent = 'Retry save';
        retryBtn.onclick = () => {
          attemptSave();
        };
        errorContainer.appendChild(retryBtn);
      }
    }

    await attemptSave();
  }

  if (exercise.task_class === 'recognition_item' && exercise.options) {
    const optionsContainer = document.createElement('div');
    optionsContainer.className = 'options-grid';
    for (const opt of exercise.options) {
      const btn = document.createElement('button');
      btn.className = 'btn option-btn';
      btn.textContent = opt;
      btn.onclick = () => handleResponse(opt);
      optionsContainer.appendChild(btn);
    }
    interactionArea.appendChild(optionsContainer);
  } else {
    const form = document.createElement('div');
    form.className = 'recall-form';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'text-input';
    input.placeholder = 'Type your answer';
    input.autocomplete = 'off';
    input.autocapitalize = 'none';

    const checkBtn = document.createElement('button');
    checkBtn.className = 'btn';
    checkBtn.textContent = 'Check';
    checkBtn.onclick = () => {
      if (input.value.trim().length > 0) {
        handleResponse(input.value);
      }
    };

    input.onkeydown = e => {
      if (e.key === 'Enter' && input.value.trim().length > 0) {
        handleResponse(input.value);
      }
    };

    form.appendChild(input);
    form.appendChild(checkBtn);
    interactionArea.appendChild(form);
  }

  card.appendChild(interactionArea);
  container.appendChild(card);

  // Backup button
  const backupBtn = document.createElement('button');
  backupBtn.className = 'btn backup-btn';
  backupBtn.textContent = 'Copy backup (JSON)';
  backupBtn.onclick = () => {
    if (currentState) {
      const jsonStr = serializeState(currentState);
      copyText(jsonStr, container, backupBtn, 'Copied to clipboard');
    }
  };
  container.appendChild(backupBtn);

  // In-App PWA Install button
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in navigator && (navigator as unknown as { standalone?: boolean }).standalone === true);

  if (!isStandalone) {
    const installContainer = document.createElement('div');
    installContainer.style.marginTop = '8px';

    const updateInstallButton = () => {
      installContainer.textContent = '';
      if (deferredInstallPrompt) {
        const installBtn = document.createElement('button');
        installBtn.className = 'btn';
        installBtn.textContent = 'Install ELOS App';
        installBtn.onclick = async () => {
          if (!deferredInstallPrompt) return;
          await deferredInstallPrompt.prompt();
          const { outcome } = await deferredInstallPrompt.userChoice;
          if (outcome === 'accepted') {
            deferredInstallPrompt = null;
            updateInstallButton();
          }
        };
        installContainer.appendChild(installBtn);
      }
    };

    onInstallPromptChange = updateInstallButton;
    updateInstallButton();
    container.appendChild(installContainer);
  }

  root.appendChild(container);
}

export async function initApp(): Promise<void> {
  const root = document.getElementById('root') || document.body;
  try {
    const result = await store.load();
    if (result.status === 'corrupt') {
      renderCorruptScreen(root, result.raw);
      return;
    }

    if (result.status === 'empty') {
      const randomDeviceId = 'dev-' + Math.random().toString(36).slice(2, 10);
      const newClient = createClient(randomDeviceId);
      await store.save(newClient);
      currentState = newClient;
    } else {
      currentState = result.state;
    }

    renderApp(root);
  } catch (err) {
    root.textContent = '';
    const container = document.createElement('div');
    container.className = 'container';

    const errHeading = document.createElement('h1');
    errHeading.className = 'error-text';
    errHeading.textContent = 'Error';

    const errMsg = document.createElement('p');
    errMsg.className = 'notice-line';
    errMsg.textContent = err instanceof Error ? err.message : String(err);

    container.appendChild(errHeading);
    container.appendChild(errMsg);
    root.appendChild(container);
  }
}

initApp();
