import {
  ClientState,
} from '../../kernel/index.js';
import {
  Exercise,
  GeneratorContext,
  submitAnswer,
} from '../../app/exercises.js';
import type { StatusBlockController } from './statusBlock.js';
import {
  createCard,
  createContainer,
  createHeader,
} from './common.js';

export interface ExerciseDeps {
  exercise: Exercise;
  index: number; // 1-based position within the session
  total: number;
  unitTitle: string;
  ruleSummaryEn: string;
  statusController: StatusBlockController;
  getState: () => ClientState | null;
  newContext: () => GeneratorContext;
  persist: (state: ClientState) => Promise<void>;
  onStateUpdated: (state: ClientState, correct: boolean) => void;
  onNext: () => void;
}

/**
 * The exercise screen: options or a text input with a Check button, plus
 * the session progress. The event is persisted BEFORE the feedback is
 * shown; a failed save shows an error with a working Retry.
 */
export function renderExerciseScreen(root: HTMLElement, deps: ExerciseDeps): void {
  const { exercise } = deps;

  root.textContent = '';
  const container = createContainer();
  container.appendChild(createHeader(deps.unitTitle));
  container.appendChild(deps.statusController.element);

  const errorContainer = document.createElement('div');
  errorContainer.id = 'error-area';
  errorContainer.className = 'error-area';
  container.appendChild(errorContainer);

  const progressLine = document.createElement('div');
  progressLine.className = 'session-progress';
  progressLine.textContent = `${deps.index} / ${deps.total}`;
  container.appendChild(progressLine);

  const card = createCard('exercise-card');

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

    if (exercise.note_en) {
      const note = document.createElement('div');
      note.className = 'answer-info note-line';
      note.textContent = exercise.note_en;
      interactionArea.appendChild(note);
    }

    if (!submitResult.correct) {
      const rule = document.createElement('div');
      rule.className = 'answer-info';
      const ruleLabel = document.createElement('span');
      ruleLabel.className = 'section-label';
      ruleLabel.textContent = 'Rule: ';
      rule.appendChild(ruleLabel);
      rule.appendChild(document.createTextNode(deps.ruleSummaryEn));
      interactionArea.appendChild(rule);
    }

    const nextBtn = document.createElement('button');
    nextBtn.className = 'btn btn-primary';
    nextBtn.textContent = 'Next';
    nextBtn.onclick = () => {
      deps.onNext();
    };
    interactionArea.appendChild(nextBtn);
    nextBtn.focus();
  }

  async function handleResponse(responseStr: string): Promise<void> {
    if (hasSubmitted) return;
    const state = deps.getState();
    if (!state) return;
    hasSubmitted = true;

    let submitResult: { state: ClientState; correct: boolean };
    try {
      submitResult = submitAnswer(state, exercise, responseStr, deps.newContext());
    } catch (err) {
      errorContainer.textContent = `Error recording event: ${err instanceof Error ? err.message : String(err)}`;
      errorContainer.style.display = 'block';
      return;
    }

    async function attemptSave(): Promise<void> {
      try {
        await deps.persist(submitResult.state);
        errorContainer.textContent = '';
        errorContainer.style.display = 'none';
        // Update the app state BEFORE refreshing the status block so the
        // unsynced count is current the moment feedback appears (D.1 fix).
        deps.onStateUpdated(submitResult.state, submitResult.correct);
        deps.statusController.update();
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

  root.appendChild(container);
  const inputEl = container.querySelector<HTMLInputElement>('.text-input');
  if (inputEl) {
    inputEl.focus();
  }
}
