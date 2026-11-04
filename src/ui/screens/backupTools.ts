import type { ClientState } from '../../kernel/index.js';
import { serializeState } from '../../app/index.js';
import { buildBackup, parseBackup, mergeBackup } from '../../app/backup.js';
import { copyTextToClipboard } from './clipboard.js';
import { createButton } from './common.js';
import { sha256HexViaSubtle, downloadBackupFile, pickBackupFile } from '../backupIo.js';

/**
 * The backup controls of the home screen, extracted from main.ts in
 * Milestone J1 to keep main.ts under the 400-line rule. Pure DOM wiring:
 * every data operation is injected, exactly as before the extraction.
 *
 * The notice line keeps the G3-FIX behavior: its text lives in a
 * module-level variable, so it survives showHome() re-renders.
 */

let backupNotice = '';

export interface BackupButtonDeps {
  getState: () => ClientState | null;
}

/** "Copy backup (JSON)": the quick clipboard copy of the raw state. */
export function createBackupButton(deps: BackupButtonDeps): HTMLButtonElement {
  const backupBtn = document.createElement('button');
  backupBtn.className = 'btn backup-btn';
  backupBtn.textContent = 'Copy backup (JSON)';
  backupBtn.onclick = () => {
    const state = deps.getState();
    if (state) {
      const host = backupBtn.parentElement || document.body;
      void copyTextToClipboard(
        serializeState(state),
        host as HTMLElement,
        backupBtn,
        'Copied to clipboard'
      );
    }
  };
  return backupBtn;
}

export interface BackupToolsDeps {
  getState: () => ClientState | null;
  /** Persists a merged state and makes it the current one. */
  applyState: (state: ClientState) => Promise<void>;
  showHome: () => void;
  /** Runs the sync when appropriate (main decides the sign-in guard). */
  onMaybeSync: () => void;
}

/** "Export backup" + "Import backup" with the shared notice line. */
export function createBackupTools(deps: BackupToolsDeps): HTMLElement {
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
    const state = deps.getState();
    if (!state) return;
    setMsg('');
    exportBtn.disabled = true;
    try {
      const b = await buildBackup(state, new Date().toISOString(), sha256HexViaSubtle);
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
      const current = deps.getState();
      if (!current) { setMsg('Import failed: no local state'); return; }
      const parsed = await parseBackup(raw, sha256HexViaSubtle);
      if (parsed.kind === 'invalid') { setMsg('Import failed: ' + parsed.reason); return; }
      const m = mergeBackup(current, parsed.backup);
      await deps.applyState(m.state);
      setMsg('Imported: added ' + m.added + ', merged ' + m.merged + '.');
      deps.showHome();
      deps.onMaybeSync();
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
