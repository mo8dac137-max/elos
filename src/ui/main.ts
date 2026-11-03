import {
  createClient, ClientState, activeEvents, deriveFromClient, deriveReviewInfo,
} from '../kernel/index.js';
import { Exercise, GeneratorContext, serializeState } from '../app/index.js';
import { CURRICULUM, PLANNER_CONFIG, findUnitDef, unitTitle } from '../app/curriculum.js';
import { startSession, nextExercise, needsIntro, summarizeSession, UnitSummary } from '../app/session.js';
import { buildBackup, parseBackup, mergeBackup } from '../app/backup.js';
import { IndexedDbClientStore } from './indexedDbStore.js';
import { copyTextToClipboard } from './screens/clipboard.js';
import { renderCorruptScreen } from './screens/corrupt.js';
import { createStatusBlock } from './screens/statusBlock.js';
import { renderHome } from './screens/home.js';
import { renderIntro } from './screens/intro.js';
import { renderExerciseScreen } from './screens/exercise.js';
import { renderSummary } from './screens/summary.js';
import { renderProgressMap } from './screens/progress.js';
import { renderUnitCard } from './screens/unitCard.js';
import { initPWA, subscribeInstallPrompt, promptInstall } from './pwa.js';
import { signIn, SignInError, AuthSession } from '../sync/auth.js';
import { runSync, SyncOutcome } from '../sync/sync.js';
import { loadAuthSession, saveAuthSession, getLastSyncedAt, setLastSyncedAt } from './authStore.js';
import { createSyncBar } from './screens/syncBar.js';
import { sha256HexViaSubtle, downloadBackupFile, pickBackupFile } from './backupIo.js';

const store = new IndexedDbClientStore();

let currentState: ClientState | null = null;
let currentAuth: AuthSession | null = null;
let progressUnitId: string | null = null;
let isSyncing = false;
let backupNotice = '';

interface SessionRun {
  tasks: ReturnType<typeof startSession>;
  index: number;
  introShown: string[];
  before: UnitSummary[];
  answered: number;
  correct: number;
  touched: Set<string>;
  lastItemId: string | null;
}

let session: SessionRun | null = null;

function generateId(): string {
  return 'ev-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
}

function getContext(): GeneratorContext {
  return {
    now: () => new Date().toISOString(),
    newId: generateId,
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

function allUnitSummaries(state: ClientState): UnitSummary[] {
  const events = activeEvents(state);
  return CURRICULUM.map((u) => ({
    unit_id: u.id,
    state: deriveFromClient(state, u.id, PLANNER_CONFIG.derive).state,
    due_at: deriveReviewInfo(u.id, events, PLANNER_CONFIG.review).due_at,
  }));
}

function makeBackupButton(): HTMLButtonElement {
  const backupBtn = document.createElement('button');
  backupBtn.className = 'btn backup-btn';
  backupBtn.textContent = 'Copy backup (JSON)';
  backupBtn.onclick = () => {
    if (currentState) {
      const jsonStr = serializeState(currentState);
      const host = backupBtn.parentElement || document.body;
      copyTextToClipboard(jsonStr, host as HTMLElement, backupBtn, 'Copied to clipboard');
    }
  };
  return backupBtn;
}

function makeInstallElement(): HTMLElement {
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
  return installContainer;
}

function makeBackupTools(): HTMLElement {
  const container = document.createElement('div');
  container.className = 'backup-tools';
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:8px;margin-top:8px;';
  const notice = document.createElement('div');
  notice.className = 'notice-line';
  notice.textContent = backupNotice;
  const setMsg = (msg: string) => { backupNotice = msg; notice.textContent = msg; };

  const exportBtn = document.createElement('button');
  exportBtn.className = 'btn';
  exportBtn.textContent = 'Export backup';
  exportBtn.onclick = async () => {
    if (!currentState) return;
    setMsg('');
    exportBtn.disabled = true;
    try {
      const b = await buildBackup(currentState, nowIso(), sha256HexViaSubtle);
      downloadBackupFile(b);
      setMsg('Backup exported (' + b.event_count + ' events).');
    } catch (err) {
      setMsg('Export failed: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      exportBtn.disabled = false;
    }
  };

  const importBtn = document.createElement('button');
  importBtn.className = 'btn';
  importBtn.textContent = 'Import backup';
  importBtn.onclick = async () => {
    setMsg('');
    importBtn.disabled = true;
    try {
      const raw = await pickBackupFile();
      if (raw === null) return;
      if (!currentState) { setMsg('Import failed: no local state'); return; }
      const parsed = await parseBackup(raw, sha256HexViaSubtle);
      if (parsed.kind === 'invalid') { setMsg('Import failed: ' + parsed.reason); return; }
      const m = mergeBackup(currentState, parsed.backup);
      currentState = m.state;
      await store.save(currentState);
      setMsg('Imported: added ' + m.added + ', merged ' + m.merged + '.');
      showHome();
      if (currentAuth !== null) performSync().catch(() => {});
    } catch (err) {
      setMsg('Import failed: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      importBtn.disabled = false;
    }
  };

  row.appendChild(exportBtn);
  row.appendChild(importBtn);
  container.appendChild(row);
  container.appendChild(notice);
  return container;
}

async function performSync(): Promise<SyncOutcome> {
  if (isSyncing) {
    return { status: 'offline', pushed: 0, pulled: 0, last_synced_at: null, message: 'Sync already in progress' };
  }
  if (!currentAuth || !currentState) {
    return { status: 'not_signed_in', pushed: 0, pulled: 0, last_synced_at: null };
  }
  isSyncing = true;
  try {
    const r = await runSync(fetch, currentState, currentAuth);
    currentState = r.state;
    currentAuth = r.session;
    await store.save(currentState);
    if (r.session) await saveAuthSession(r.session);
    if (r.outcome.status === 'ok' && r.outcome.last_synced_at) {
      setLastSyncedAt(r.outcome.last_synced_at);
    }
    showHome();
    return r.outcome;
  } finally {
    isSyncing = false;
  }
}

function showHome(): void {
  const root = document.getElementById('root') || document.body;
  if (!currentState) return;

  const statusController = createStatusBlock(
    () => currentState,
    () => null
  );

  const syncBar = createSyncBar({
    getSignedIn: () => currentAuth !== null,
    getLastSyncedAt,
    onSignIn: async (email, password) => {
      try {
        currentAuth = await signIn(fetch, email, password);
        await saveAuthSession(currentAuth);
        return null;
      } catch (err) {
        return err instanceof SignInError ? err.message : String(err);
      }
    },
    onSyncNow: async () => {
      return await performSync();
    },
  });

  renderHome(root, {
    state: currentState,
    nowIso: nowIso(),
    statusElement: statusController.element,
    syncBarElement: syncBar.element,
    backupButton: makeBackupButton(),
    backupToolsElement: makeBackupTools(),
    installElement: makeInstallElement(),
    onStartSession: (size) => startSessionFlow(size),
    onOpenProgress: () => {
      progressUnitId = null;
      showProgress();
    },
  });
}

function startSessionFlow(size: number): void {
  if (!currentState) return;
  const tasks = startSession(currentState, nowIso(), size);
  if (tasks.length === 0) {
    showHome();
    return;
  }
  session = {
    tasks, index: 0, introShown: [], before: allUnitSummaries(currentState),
    answered: 0, correct: 0, touched: new Set<string>(), lastItemId: null,
  };
  renderSessionStep();
}

function renderSessionStep(): void {
  const root = document.getElementById('root') || document.body;
  if (!currentState || !session) return;

  const task = session.tasks[session.index];
  const unitDef = findUnitDef(task.unit_id);

  if (unitDef && needsIntro(currentState, task.unit_id, session.introShown)) {
    session.introShown.push(task.unit_id);
    renderIntro(root, {
      unitDef,
      onStart: () => renderSessionStep(),
    });
    return;
  }

  const exercise: Exercise = nextExercise(currentState, task, session.lastItemId);

  const statusController = createStatusBlock(
    () => currentState,
    () => task.unit_id
  );

  renderExerciseScreen(root, {
    exercise,
    index: session.index + 1,
    total: session.tasks.length,
    unitTitle: unitTitle(task.unit_id),
    ruleSummaryEn: unitDef ? unitDef.summary_en : '',
    statusController,
    getState: () => currentState,
    newContext: getContext,
    persist: (state) => store.save(state),
    onStateUpdated: (state, correct) => {
      if (!currentState || !session) return;
      currentState = state;
      session.lastItemId = exercise.id;
      session.answered += 1;
      if (correct) session.correct += 1;
      session.touched.add(task.unit_id);
    },
    onNext: () => {
      if (!session) return;
      session.index += 1;
      if (session.index >= session.tasks.length) {
        showSummary();
      } else {
        renderSessionStep();
      }
    },
  });
}

function showSummary(): void {
  const root = document.getElementById('root') || document.body;
  if (!currentState || !session) return;

  const after = allUnitSummaries(currentState).filter((s) =>
    session!.touched.has(s.unit_id)
  );
  const rows = summarizeSession(session.before, after);

  renderSummary(root, {
    answered: session.answered,
    correct: session.correct,
    rows,
    nowIso: nowIso(),
    onHome: () => {
      session = null;
      showHome();
      if (currentAuth !== null) {
        performSync().catch(() => {});
      }
    },
  });
}

function showProgress(): void {
  const root = document.getElementById('root') || document.body;
  if (!currentState) return;

  if (progressUnitId) {
    const unitDef = findUnitDef(progressUnitId);
    if (unitDef) {
      const state = deriveFromClient(currentState, unitDef.id, PLANNER_CONFIG.derive).state;
      renderUnitCard(root, {
        unitDef,
        stateLabel: state,
        onBack: () => {
          progressUnitId = null;
          showProgress();
        },
      });
      return;
    }
  }

  renderProgressMap(root, {
    state: currentState,
    nowIso: nowIso(),
    onBack: () => showHome(),
    onOpenUnit: (unitId) => {
      progressUnitId = unitId;
      showProgress();
    },
  });
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

    try {
      currentAuth = await loadAuthSession();
    } catch {
      currentAuth = null;
    }

    showHome();

    if (currentAuth !== null) {
      performSync().catch(() => {});
    }
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
