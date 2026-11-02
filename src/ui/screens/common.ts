import type { DueInfo } from '../../app/progress.js';

// Shared DOM helpers for the ELOS screens. Vanilla DOM only, no framework.

export const SESSION_SIZE_KEY = 'elos_session_size';
export const SESSION_SIZES: readonly number[] = [5, 10, 15];
export const DEFAULT_SESSION_SIZE = 10;

/**
 * The remembered session length. This is a UI preference only, never
 * learning data: it lives in localStorage and never becomes an event.
 */
export function getStoredSessionSize(): number {
  try {
    const raw = localStorage.getItem(SESSION_SIZE_KEY);
    const parsed = raw === null ? NaN : Number(raw);
    if (SESSION_SIZES.includes(parsed)) {
      return parsed;
    }
  } catch {
    // Storage unavailable: fall back to the default.
  }
  return DEFAULT_SESSION_SIZE;
}

export function storeSessionSize(size: number): void {
  try {
    localStorage.setItem(SESSION_SIZE_KEY, String(size));
  } catch {
    // Storage unavailable: the preference simply is not remembered.
  }
}

export function createContainer(): HTMLElement {
  const container = document.createElement('div');
  container.className = 'container';
  return container;
}

export function createHeader(subtitle: string): HTMLElement {
  const header = document.createElement('header');
  const heading = document.createElement('h1');
  heading.textContent = 'ELOS';
  const unitLabel = document.createElement('div');
  unitLabel.className = 'unit-label';
  unitLabel.textContent = subtitle;
  header.appendChild(heading);
  header.appendChild(unitLabel);
  return header;
}

export function createCard(...extraClasses: string[]): HTMLElement {
  const card = document.createElement('div');
  card.className = 'card' + (extraClasses.length > 0 ? ' ' + extraClasses.join(' ') : '');
  return card;
}

export function createButton(
  text: string,
  onClick: () => void,
  ...extraClasses: string[]
): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'btn' + (extraClasses.length > 0 ? ' ' + extraClasses.join(' ') : '');
  btn.textContent = text;
  btn.onclick = onClick;
  return btn;
}

/** Arabic scaffolding: an RTL block with dir="rtl" lang="ar". */
export function createRtlBlock(text: string): HTMLElement {
  const block = document.createElement('div');
  block.className = 'rtl-block';
  block.dir = 'rtl';
  block.lang = 'ar';
  block.textContent = text;
  return block;
}

export function createSectionLabel(text: string): HTMLElement {
  const label = document.createElement('div');
  label.className = 'section-label';
  label.textContent = text;
  return label;
}

export function createExampleList(examples: readonly string[]): HTMLElement {
  const list = document.createElement('ul');
  list.className = 'example-list';
  for (const example of examples) {
    const li = document.createElement('li');
    li.textContent = example;
    list.appendChild(li);
  }
  return list;
}

function plural(count: number, unit: string): string {
  return `${count} ${unit}${count === 1 ? '' : 's'}`;
}

/** "Not started" / "Due now" / "Due in N days" / "Due in N hours". */
export function formatDue(due: DueInfo): string {
  if (due.kind === 'not_started') return 'Not started';
  if (due.kind === 'due_now') return 'Due now';
  if (due.in_ms < 3600000) return 'Due soon';
  const days = Math.floor(due.in_ms / 86400000);
  if (days >= 1) return `Due in ${plural(days, 'day')}`;
  const hours = Math.floor(due.in_ms / 3600000);
  return `Due in ${plural(hours, 'hour')}`;
}

/** The next review time for a summary row, relative to nowIso. */
export function formatDueAt(dueAt: string | null, nowIso: string): string {
  if (dueAt === null) return 'No review scheduled';
  const inMs = Date.parse(dueAt) - Date.parse(nowIso);
  if (inMs <= 0) return 'Due now';
  if (inMs < 3600000) return 'Due soon';
  const days = Math.floor(inMs / 86400000);
  if (days >= 1) return `Due in ${plural(days, 'day')}`;
  const hours = Math.floor(inMs / 3600000);
  return `Due in ${plural(hours, 'hour')}`;
}
