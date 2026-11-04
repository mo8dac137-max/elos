import type { ClientState } from '../../kernel/index.js';
import {
  countTokenStates,
  deriveReaderStates,
  parseReaderDoc,
  ReaderDoc,
  ReaderToken,
  ReaderWordState,
  serializeReaderDoc,
  tokenizeText,
} from '../../app/reader.js';
import { findUnitDef } from '../../app/curriculum.js';
import { WORD_DEFS } from '../../content/word-pack.js';
import { READER_TEXTS } from '../../content/reader-texts.js';
import { createDictSection } from './dictSection.js';
import {
  createButton,
  createCard,
  createContainer,
  createHeader,
  createRtlBlock,
  createSectionLabel,
} from './common.js';

/**
 * Milestone J1 (Smart Reader, first slice): paste or pick a short English
 * text and read it with every word colored by the state derived from the
 * evidence log (the same source of truth as the progress map). Tapping a
 * word opens a card with its Arabic gloss (curriculum words) and the real
 * dictionary section (all words). Reading records no evidence events.
 */

const READER_DOC_KEY = 'elos_reader_doc';

export interface ReaderDeps {
  getState: () => ClientState | null;
  onBack: () => void;
}

function loadSavedDoc(): ReaderDoc | null {
  try {
    const raw = localStorage.getItem(READER_DOC_KEY);
    return raw === null ? null : parseReaderDoc(raw);
  } catch {
    return null;
  }
}

function saveDoc(doc: ReaderDoc): void {
  try {
    localStorage.setItem(READER_DOC_KEY, serializeReaderDoc(doc));
  } catch {
    // Storage unavailable: the text simply is not remembered.
  }
}

const STATE_LABEL: Record<ReaderWordState, string> = {
  known: 'known — strong evidence in your log',
  learning: 'learning — you started this word',
  new: 'new — in your course, not started yet',
  outside: 'outside your course',
};

function legendRow(colorClass: string, label: string): HTMLElement {
  const row = document.createElement('div');
  row.className = 'legend-row';
  const dot = document.createElement('span');
  dot.className = 'legend-dot' + (colorClass ? ' ' + colorClass : '');
  row.appendChild(dot);
  const text = document.createElement('span');
  text.textContent = label;
  row.appendChild(text);
  return row;
}

export function renderReader(root: HTMLElement, deps: ReaderDeps): void {
  root.textContent = '';
  const container = createContainer();
  container.appendChild(createHeader('Read'));
  container.appendChild(createButton('Back', deps.onBack));

  const legend = createCard('reader-legend');
  legend.appendChild(createSectionLabel('Word colors'));
  legend.appendChild(legendRow('dot-known', 'Green: known — strong evidence in your log'));
  legend.appendChild(legendRow('dot-learning', 'Yellow: learning — you started this word'));
  legend.appendChild(legendRow('dot-new', 'Blue: new — in your course, not started yet'));
  legend.appendChild(legendRow('', 'Plain: outside your course (tap for the dictionary)'));
  container.appendChild(legend);

  const wordCardSlot = document.createElement('div');
  wordCardSlot.className = 'word-card-slot';
  // Attached immediately: showDoc (saved-text path) inserts before it.
  container.appendChild(wordCardSlot);

  const state = deps.getState();
  const states = state ? deriveReaderStates(state) : new Map<string, ReaderWordState>();

  function changeText(): void {
    try {
      localStorage.removeItem(READER_DOC_KEY);
    } catch {
      // Storage unavailable: the next showDoc simply overwrites nothing.
    }
    renderReader(root, deps);
  }

  function showDoc(doc: ReaderDoc): void {
    saveDoc(doc);
    const card = createCard('reader-doc-card');
    const title = document.createElement('div');
    title.className = 'unit-title';
    title.textContent = doc.title;
    card.appendChild(title);

    const tokens = tokenizeText(doc.text);
    const tally = countTokenStates(tokens, states);
    const summary = document.createElement('div');
    summary.className = 'reader-summary';
    summary.textContent =
      tally.words + ' words: ' +
      tally.known + ' known, ' +
      tally.learning + ' learning, ' +
      tally.new + ' new.';
    card.appendChild(summary);

    for (const paragraph of doc.text.split(/\n+/)) {
      if (paragraph.trim().length === 0) continue;
      const p = document.createElement('p');
      p.className = 'reader-para';
      for (const token of tokenizeText(paragraph)) {
        p.appendChild(tokenNode(token));
      }
      card.appendChild(p);
    }
    container.querySelectorAll('.reader-doc-card').forEach((el) => el.remove());
    const chooser = container.querySelector('.reader-chooser');
    if (chooser) chooser.remove();
    const tools = document.createElement('div');
    tools.className = 'reader-tools';
    tools.appendChild(createButton('Change text', changeText));
    card.appendChild(tools);
    container.insertBefore(card, wordCardSlot);
  }

  function tokenNode(token: ReaderToken): HTMLElement {
    if (token.key === null) {
      const span = document.createElement('span');
      span.textContent = token.raw + ' ';
      return span;
    }
    const wordState = states.get(token.key) ?? 'outside';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'reader-word reader-' + wordState;
    btn.textContent = token.raw;
    btn.onclick = () => showWordCard(token, wordState);
    return btn;
  }

  function showWordCard(token: ReaderToken, wordState: ReaderWordState): void {
    const key = token.key as string;
    wordCardSlot.textContent = '';
    const card = createCard('word-popup');

    const head = document.createElement('div');
    head.className = 'unit-title';
    head.textContent = token.raw === key ? key : token.raw + '  \u2192  ' + key;
    card.appendChild(head);

    const stateLine = document.createElement('div');
    stateLine.className = 'due-line';
    stateLine.textContent = 'State: ' + STATE_LABEL[wordState] + '.';
    card.appendChild(stateLine);

    const def = WORD_DEFS.find((w) => w.id === key);
    if (def) {
      card.appendChild(createSectionLabel('Meaning'));
      card.appendChild(createRtlBlock(def.gloss + ' \u2014 ' + def.ar));
      card.appendChild(createSectionLabel('Example'));
      const ex = document.createElement('div');
      ex.className = 'summary-en';
      ex.textContent = def.example;
      card.appendChild(ex);
      card.appendChild(createSectionLabel('Common mistake'));
      card.appendChild(createRtlBlock(def.mistake));
      const openUnit = findUnitDef('word:' + key);
      if (openUnit) {
        card.appendChild(createSectionLabel('Course: ' + openUnit.title));
      }
    }

    const dict = createDictSection('word:' + (token.dictKey ?? key));
    if (dict) card.appendChild(dict);
    card.appendChild(createButton('Close', () => { wordCardSlot.textContent = ''; }));
    wordCardSlot.appendChild(card);
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  const saved = loadSavedDoc();
  if (saved) {
    showDoc(saved);
  } else {
    const chooser = createCard('reader-chooser');
    chooser.id = 'reader-chooser';
    chooser.appendChild(createSectionLabel('Start with a short text'));
    for (const text of READER_TEXTS) {
      chooser.appendChild(
        createButton(text.title, () => showDoc({ title: text.title, text: text.text }))
      );
    }
    chooser.appendChild(createSectionLabel('Or paste your own text'));
    const ta = document.createElement('textarea');
    ta.className = 'text-input';
    ta.rows = 6;
    ta.placeholder = 'Paste any simple English text here...';
    chooser.appendChild(ta);
    chooser.appendChild(
      createButton('Show my text', () => {
        const value = ta.value.trim();
        if (value.length === 0) return;
        showDoc({ title: 'My text', text: value });
      })
    );
    container.appendChild(chooser);
  }

  root.appendChild(container);
}
