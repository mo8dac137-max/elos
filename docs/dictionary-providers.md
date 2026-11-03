# Dictionary providers (Milestone I2)

ELOS shows a rich dictionary card for every vocabulary word unit. This note
records what was built and the verified facts about the provider.

## What the learner sees

On a word unit card (Progress map → any `Word: …` unit), below the common
mistake and above the AI help section:

- the IPA transcription (when known),
- a **Play audio** button (real recorded pronunciation, when the provider
  has an https audio URL),
- up to 4 parts of speech with up to 3 definitions each, examples in
  italics,
- the source line `Free Dictionary API`.

No sign-in is required: the provider is keyless, and the section loads
itself when the card opens. Dictionary text is reference content only — it
never becomes learning evidence and never touches the kernel.

## Provider facts (verified live 2026-11-04)

- Endpoint: `https://api.dictionaryapi.dev/api/v2/entries/en/<word>` (no key).
- CORS: `access-control-allow-origin: *` — direct browser calls are allowed.
- Rate limit: about **450 requests per rate window** per client.
- Not found: HTTP 404 with a JSON body.
- Note for local audits: the API's Cloudflare layer rejects *headless*
  browser user agents (403) but serves normal browsers — audit locally with
  a network mock, and verify real lookups on a real phone.

## Caching

Every successful lookup is normalized into a `DictEntry` and stored in a
**separate IndexedDB database `elos-dict`** (store `entries`, key = lowercase
lemma), never in the learner-state database. The cache never expires: one
network request per word, ever, per device. Cached entries render instantly
and offline.

## Failure behaviour (all graceful, one notice line each)

| Situation | Message |
|---|---|
| word unknown to the provider | `No dictionary entry for «word».` |
| offline, never cached | `Offline. The dictionary loads once, then it stays on this device.` |
| provider slower than 10 s | `Dictionary timed out. Try again later.` |
| other HTTP/body errors | `Dictionary error: http_NNN / bad_response / bad_output` |

Audio playback needs a connection (it is not cached); failures show
`Audio needs a connection. Try again when online.`

## Architecture

- `src/dict/types.ts` — `DictEntry`, `DictOutcome`.
- `src/dict/provider.ts` — `DictProvider` interface (replaceable per the
  handoff), `FreeDictionaryProvider` (fetch injected, 10 s bound), and the
  pure, deterministic `normalizeDictResponse` with hard caps (4 parts of
  speech, 3 definitions each, 800/300/300-char limits, https-only audio).
- `src/dict/cache.ts` — `DictCache` interface, `IndexedDbDictCache`
  (own database), `MemoryDictCache` (tests).
- `src/ui/screens/dictSection.ts` — the self-loading card section.

Adding a second provider (Wiktionary, Datamuse) means implementing
`DictProvider` and choosing per lookup; nothing else changes.
