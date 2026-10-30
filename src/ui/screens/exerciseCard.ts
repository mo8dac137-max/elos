import { Exercise, submitAnswer } from '../../app/index.js';
import { ClientState } from '../../kernel/index.js';

export interface ExerciseCardOptions {
  exercise: Exercise;
  onSubmit: (response: string) => Promise<void>;
}

export function createExerciseCard(
  exercise: Exercise,
  onSubmitResponse: (response: string) => Promise<void>
): HTMLElement {
  const card = document.createElement('div');
  card.className = 'card exercise-card';

  const promptEl = document.createElement('div');
  promptEl.className = 'prompt-text';
  promptEl.textContent = exercise.prompt;
  card.appendChild(promptEl);

  const interactionArea = document.createElement('div');
  interactionArea.className = 'interaction-area';

  let hasSubmitted = false;

  async function handleResponse(responseStr: string): Promise<void> {
    if (hasSubmitted) return;
    hasSubmitted = true;
    await onSubmitResponse(responseStr);
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
  return card;
}

export function renderFeedbackArea(
  interactionArea: HTMLElement,
  exercise: Exercise,
  isCorrect: boolean,
  onNext: () => void
): void {
  interactionArea.textContent = '';

  const feedback = document.createElement('div');
  feedback.className = isCorrect ? 'feedback-correct' : 'feedback-incorrect';
  feedback.textContent = isCorrect ? 'Correct' : 'Not quite';
  interactionArea.appendChild(feedback);

  const answerInfo = document.createElement('div');
  answerInfo.className = 'answer-info';
  answerInfo.textContent = `Answer: ${exercise.answer}`;
  interactionArea.appendChild(answerInfo);

  const nextBtn = document.createElement('button');
  nextBtn.className = 'btn btn-primary';
  nextBtn.textContent = 'Next';
  nextBtn.onclick = onNext;
  interactionArea.appendChild(nextBtn);
  nextBtn.focus();
}
