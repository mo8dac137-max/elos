import type { DictEntry, DictOutcome } from '../../dict/types.js';
import type { DictCache } from '../../dict/cache.js';
import type { DictProvider, DictFetch } from '../../dict/provider.js';
import { FreeDictionaryProvider } from '../../dict/provider.js';
import { getDictCache } from '../../dict/cache.js';
import { createButton, createSectionLabel } from './common.js';

/**
 * Milestone I2: the rich word card. A self-loading "Dictionary" section
 * for word units only: the permanent cache answers first (instant, works
 * offline), and on a miss ONE bounded network lookup is made and cached
 * forever. Every failure degrades to a single notice line and never
 * blocks the rest of the unit card. Dictionary text is reference content,
 * not learning evidence, and needs no sign-in (the provider is keyless).
 */

export interface DictSectionDeps {
  /** Defaults to the shared IndexedDB dictionary cache. */
  cache?: DictCache;
  /** Defaults to the Free Dictionary API with the global fetch. */
  provider?: DictProvider;
  /** Fetch override for tests (ignored when a provider is given). */
  fetchImpl?: DictFetch;
}

export function createDictSection(
  unitId: string,
  deps: DictSectionDeps = {}
): HTMLElement | null {
  if (!unitId.startsWith('word:')) return null;
  const word = unitId.slice('word:'.length);

  const cache = deps.cache ?? getDictCache();
  const provider =
    deps.provider ?? new FreeDictionaryProvider(deps.fetchImpl ?? fetch);

  const section = document.createElement('div');
  section.className = 'dict-section';
  section.appendChild(createSectionLabel('Dictionary'));

  const content = document.createElement('div');
  const loading = document.createElement('div');
  loading.className = 'notice-line';
  loading.textContent = 'Loading dictionary...';
  content.appendChild(loading);
  section.appendChild(content);

  function clearLoading(): void {
    if (loading.parentElement === content) {
      loading.remove();
    }
  }

  void load();

  async function load(): Promise<void> {
    try {
      const cached = await cache.get(word);
      if (cached !== null) {
        renderEntry(cached, true);
        return;
      }
    } catch {
      // Cache read failure is non-fatal: fall through to the network.
    }

    const outcome = await provider.lookup(word);
    if (outcome.status === 'ok') {
      try {
        await cache.put(word, outcome.entry);
      } catch {
        // Cache write failure is non-fatal: the entry still renders.
      }
      renderEntry(outcome.entry, false);
      return;
    }
    showOutcome(outcome);
  }

  function renderEntry(entry: DictEntry, fromCache: boolean): void {
    content.textContent = '';

    const head = document.createElement('div');
    head.className = 'summary-en';
    head.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;';
    if (entry.phonetic !== null) {
      const ph = document.createElement('span');
      ph.textContent = entry.phonetic;
      head.appendChild(ph);
    }
    if (entry.audioUrl !== null) {
      const audioBtn = createButton('Play audio', () => {
        playAudio(entry.audioUrl as string, audioBtn);
      });
      audioBtn.style.minHeight = '32px';
      audioBtn.style.padding = '4px 12px';
      head.appendChild(audioBtn);
    }
    if (head.childElementCount > 0) {
      content.appendChild(head);
    }

    for (const meaning of entry.meanings) {
      const posLabel = document.createElement('div');
      posLabel.className = 'section-label';
      posLabel.textContent = meaning.partOfSpeech;
      content.appendChild(posLabel);

      const list = document.createElement('ul');
      list.className = 'example-list';
      for (const def of meaning.definitions) {
        const li = document.createElement('li');
        li.textContent = def.definition;
        if (def.example !== null) {
          const ex = document.createElement('i');
          ex.textContent = ' ' + def.example;
          li.appendChild(ex);
        }
        list.appendChild(li);
      }
      content.appendChild(list);
    }

    const source = document.createElement('div');
    source.className = 'due-line';
    source.style.marginTop = '6px';
    source.textContent = fromCache
      ? 'Source: Free Dictionary API (cached on this device)'
      : 'Source: Free Dictionary API';
    content.appendChild(source);
  }

  function playAudio(url: string, audioBtn: HTMLButtonElement): void {
    audioBtn.disabled = true;
    try {
      const audio = new Audio(url);
      const restore = () => {
        audioBtn.disabled = false;
      };
      audio.onended = restore;
      audio.onerror = () => {
        restore();
        showNotice('Audio needs a connection. Try again when online.');
      };
      const played = audio.play();
      if (played && typeof played.catch === 'function') {
        played.catch(() => {
          restore();
          showNotice('Audio needs a connection. Try again when online.');
        });
      }
    } catch {
      audioBtn.disabled = false;
      showNotice('Audio could not play on this device.');
    }
  }

  function showNotice(text: string): void {
    clearLoading();
    const line = document.createElement('div');
    line.className = 'notice-line';
    line.textContent = text;
    content.appendChild(line);
  }

  function showOutcome(outcome: DictOutcome): void {
    if (outcome.status === 'not_found') {
      showNotice(`No dictionary entry for «${word}».`);
    } else if (outcome.status === 'offline') {
      showNotice('Offline. The dictionary loads once, then it stays on this device.');
    } else if (outcome.status === 'error') {
      if (outcome.message === 'timeout') {
        showNotice('Dictionary timed out. Try again later.');
      } else {
        showNotice('Dictionary error: ' + outcome.message);
      }
    }
  }

  return section;
}
