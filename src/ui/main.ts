import {
  createClient,
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
import { copyTextToClipboard } from './screens/clipboard.js';
import { renderCorruptScreen } from './screens/corrupt.js';
import { createStatusBlock } from './screens/statusBlock.js';
import {
  initPWA,
  subscribeInstallPrompt,
  promptInstall,
} from './pwa.js';

const store = new IndexedDbClientStore();

let currentState: ClientState | null = null;
const currentUnitId: string = 'grammar:go-went-gone';
let currentExercise: Exercise | null = null;
let lastAnsweredId: string | null = null;

function generateId(): string {
  return 'ev-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
}

function getContext() {
  return {
    now: () => new Date().toISOString(),
    newId: generateId,
  };
}

function renderApp(root: HTMLElement): void {
  if (!currentState) return;

  root.textContent = '';

  const container = document.createElement('div');
  container.className = 'container';

  // Header
  const header = document.createElement('header');
  const heading = document.createElement('h1');
  heading.textContent = 'ELOS';

  const unitLabel = document.createElement('div');
  unitLabel.className = 'unit-label';
  unitLabel.textContent = 'Grammar: go / went / gone';

  header.appendChild(heading);
  header.appendChild(unitLabel);
  container.appendChild(header);

  // Status Block
  const statusController = createStatusBlock(
    () => currentState,
    () => currentUnitId
  );
  container.appendChild(statusController.element);

  const errorContainer = document.createElement('div');
  errorContainer.id = 'error-area';
  errorContainer.className = 'error-area';
  container.appendChild(errorContainer);

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

    let submitResult: { state: ClientState; correct: boolean };
    try {
      submitResult = submitAnswer(currentState, exercise, responseStr, getContext());
    } catch (err) {
      errorContainer.textContent = `Error recording event: ${err instanceof Error ? err.message : String(err)}`;
      errorContainer.style.display = 'block';
      return;
    }

    currentState = submitResult.state;
    lastAnsweredId = exercise.id;

    async function attemptSave(): Promise<void> {
      try {
        await store.save(currentState!);
        errorContainer.textContent = '';
        errorContainer.style.display = 'none';
        statusController.update();
        showFeedback(submitResult);
      } catch (saveErr) {
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

    input.onkeydown = (e) => {
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
      copyTextToClipboard(jsonStr, container, backupBtn, 'Copied to clipboard');
    }
  };
  container.appendChild(backupBtn);

  // In-App PWA Install button
  const installContainer = document.createElement('div');
  installContainer.style.marginTop = '8px';

  subscribeInstallPrompt((canInstall) => {
    installContainer.textContent = '';
    if (canInstall) {
      const installBtn = document.createElement('button');
      installBtn.className = 'btn';
      installBtn.textContent = 'Install ELOS App';
      installBtn.onclick = async () => {
        await promptInstall();
      };
      installContainer.appendChild(installBtn);
    }
  });

  container.appendChild(installContainer);
  root.appendChild(container);
}

export async function initApp(): Promise<void> {
  const root = document.getElementById('root') || document.body;
  initPWA();

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
