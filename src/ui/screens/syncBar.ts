import type { SyncOutcome } from '../../sync/sync.js';
import { createButton, createCard } from './common.js';

export interface SyncBarDeps {
  getSignedIn: () => boolean;
  getLastSyncedAt: () => string | null;
  onSignIn: (email: string, password: string) => Promise<string | null>;
  onSyncNow: () => Promise<SyncOutcome>;
}

export function createSyncBar(deps: SyncBarDeps): { element: HTMLElement; refresh: () => void } {
  const card = createCard('sync-card');
  let showingForm = false;
  let lastOutcomeMessage: string | null = null;

  function render(): void {
    card.textContent = '';
    const signedIn = deps.getSignedIn();

    if (!signedIn) {
      const offlineNotice = document.createElement('div');
      offlineNotice.className = 'notice-line';
      offlineNotice.textContent = 'Learning works offline. Sign in to sync across devices.';
      card.appendChild(offlineNotice);

      if (!showingForm) {
        const signInBtn = createButton('Sign in to sync', () => {
          showingForm = true;
          render();
        });
        signInBtn.style.marginTop = '8px';
        card.appendChild(signInBtn);
      } else {
        const form = document.createElement('div');
        form.className = 'sync-form';
        form.style.marginTop = '8px';
        form.style.display = 'flex';
        form.style.flexDirection = 'column';
        form.style.gap = '8px';

        const emailInput = document.createElement('input');
        emailInput.type = 'email';
        emailInput.autocomplete = 'username';
        emailInput.placeholder = 'Email';
        emailInput.className = 'text-input';

        const passwordInput = document.createElement('input');
        passwordInput.type = 'password';
        passwordInput.autocomplete = 'current-password';
        passwordInput.placeholder = 'Password';
        passwordInput.className = 'text-input';

        const errLine = document.createElement('div');
        errLine.className = 'error-text';
        errLine.style.display = 'none';

        const btnRow = document.createElement('div');
        btnRow.style.display = 'flex';
        btnRow.style.gap = '8px';

        const submitBtn = createButton('Sign in', async () => {
          const email = emailInput.value.trim();
          const password = passwordInput.value;
          if (!email || !password) return;

          submitBtn.disabled = true;
          submitBtn.textContent = 'Signing in...';
          cancelBtn.disabled = true;
          errLine.style.display = 'none';

          const err = await deps.onSignIn(email, password);
          if (err === null) {
            showingForm = false;
            render();
          } else {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Sign in';
            cancelBtn.disabled = false;
            errLine.textContent = `Sign-in failed: ${err}`;
            errLine.style.display = 'block';
          }
        }, 'btn-primary');

        const cancelBtn = createButton('Cancel', () => {
          showingForm = false;
          render();
        });

        btnRow.appendChild(submitBtn);
        btnRow.appendChild(cancelBtn);

        form.appendChild(emailInput);
        form.appendChild(passwordInput);
        form.appendChild(errLine);
        form.appendChild(btnRow);
        card.appendChild(form);

        emailInput.focus();
      }
    } else {
      const signedInLine = document.createElement('div');
      signedInLine.textContent = 'Signed in';
      card.appendChild(signedInLine);

      const lastSyncedRaw = deps.getLastSyncedAt();
      let formatted = 'never';
      if (lastSyncedRaw) {
        try {
          const d = new Date(lastSyncedRaw);
          if (!isNaN(d.getTime())) {
            formatted = d.toLocaleString();
          }
        } catch {
          formatted = 'never';
        }
      }

      const lastSyncedLine = document.createElement('div');
      lastSyncedLine.textContent = `Last synced: ${formatted}`;
      card.appendChild(lastSyncedLine);

      const statusLine = document.createElement('div');
      statusLine.className = 'notice-line';
      if (lastOutcomeMessage) {
        statusLine.textContent = lastOutcomeMessage;
      }
      card.appendChild(statusLine);

      const syncBtn = createButton('Sync now', async () => {
        syncBtn.disabled = true;
        syncBtn.textContent = 'Syncing...';
        try {
          const outcome = await deps.onSyncNow();
          if (outcome.status === 'ok') {
            lastOutcomeMessage = `Synced. Pushed ${outcome.pushed}, pulled ${outcome.pulled}.`;
          } else if (outcome.status === 'offline') {
            lastOutcomeMessage = 'Offline. Your answers are kept on this device.';
          } else if (outcome.status === 'error') {
            lastOutcomeMessage = `Sync blocked: ${outcome.message || ''}`;
          } else if (outcome.status === 'not_signed_in') {
            lastOutcomeMessage = 'Please sign in again.';
          }
          render();
        } finally {
          syncBtn.disabled = false;
          syncBtn.textContent = 'Sync now';
        }
      }, 'btn-primary');
      syncBtn.style.marginTop = '8px';
      card.appendChild(syncBtn);
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
