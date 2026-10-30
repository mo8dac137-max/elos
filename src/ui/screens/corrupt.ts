import { copyTextToClipboard } from './clipboard.js';

export function renderCorruptScreen(root: HTMLElement, raw: string): void {
  root.textContent = '';

  const container = document.createElement('div');
  container.className = 'container';

  const heading = document.createElement('h1');
  heading.textContent = 'ELOS';

  const unitLabel = document.createElement('div');
  unitLabel.className = 'unit-label';
  unitLabel.textContent = 'Curriculum & Sync Engine';

  const msg = document.createElement('p');
  msg.className = 'error-text';
  msg.textContent = 'Stored data is unreadable';

  const copyBtn = document.createElement('button');
  copyBtn.className = 'btn';
  copyBtn.textContent = 'Copy unreadable data';
  copyBtn.onclick = () => {
    copyTextToClipboard(raw, container, copyBtn, 'Copied to clipboard');
  };

  container.appendChild(heading);
  container.appendChild(unitLabel);
  container.appendChild(msg);
  container.appendChild(copyBtn);
  root.appendChild(container);
}
