export async function copyTextToClipboard(
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
