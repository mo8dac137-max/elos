import type { BackupFile } from '../app/backup.js';

export async function sha256HexViaSubtle(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuf = await crypto.subtle.digest('SHA-256', data);
  const bytes = new Uint8Array(hashBuf);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function backupFilename(isoString: string): string {
  const match = isoString.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if (match) {
    return `elos-backup-${match[1]}-${match[2]}-${match[3]}-${match[4]}-${match[5]}-${match[6]}.json`;
  }
  const d = new Date(isoString);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `elos-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}.json`;
}

export function downloadBackupFile(backup: BackupFile): void {
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = backupFilename(backup.created_at);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

export function pickBackupFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.display = 'none';
    document.body.appendChild(input);

    let resolved = false;
    const cleanup = () => {
      if (input.parentElement) {
        input.parentElement.removeChild(input);
      }
    };

    input.onchange = async () => {
      if (resolved) return;
      resolved = true;
      const file = input.files && input.files[0];
      cleanup();
      if (!file) {
        resolve(null);
        return;
      }
      try {
        const text = await file.text();
        resolve(text);
      } catch {
        resolve(null);
      }
    };

    input.oncancel = () => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(null);
    };

    window.addEventListener(
      'focus',
      () => {
        setTimeout(() => {
          if (!resolved && (!input.files || input.files.length === 0)) {
            resolved = true;
            cleanup();
            resolve(null);
          }
        }, 500);
      },
      { once: true }
    );

    input.click();
  });
}
