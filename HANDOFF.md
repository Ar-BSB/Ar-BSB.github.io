# La Recetera — project handoff

Static site, no framework, no build step: `index.html`, `style.css`, `script.js`, `config.js`, plus a Cloudflare Worker (`worker.js`, `wrangler.toml`) and `README.md`. Read all of these files in full before changing anything — they're short and the conventions matter more than they look.

## What it is

An Argentine cooking assistant. Rioplatense Spanish persona ("La Recetera") baked into the system prompt in `script.js`, never breaks character, never mentions being an AI. Calls Groq's OpenAI-compatible endpoint (`openai/gpt-oss-120b`) and gets back one of five JSON shapes, parsed and rendered as DOM (no innerHTML for model content, no markdown rendering):

1. `picks` — used when the person names a craving but not a specific dish ("quiero hacer milanesas"). Model returns 3 distinct routes (different technique/time/region). Rendered as 3 clickable cards (`renderPicks`). Choosing one dims the other two, marks the chosen one, and auto-sends "Elijo X, pasame la receta completa." Choice is recoverable after reload by checking the next stored user message against the pick titles.
2. `recipe` — title/time/servings/ingredients[]/steps[]/story?/image?. `image` is a plain dish name (e.g. "Locro") the model provides for photo lookup — see below.
3. `help` — mid-recipe troubleshooting/substitutions.
4. `tip` — food trivia, not a recipe request.
5. `chat` — greetings, general talk, clarifying questions.

Schemas 2–5 can carry an optional `options: string[3]` for follow-up quick-replies, rendered as `.choice` buttons that re-send that text.

## Design language (keep consistent)

Warm cream/white background, Fraunces (serif — headings, italic for asides/captions/story) + Inter (sans — body/UI), one orange accent `#e8590c`, zero border-radius anywhere, hairline borders (`var(--line)`), small square/circle motifs instead of icons or emoji, no ALL-CAPS labels, no added chrome. `prefers-reduced-motion` is respected throughout (transitions and pulse animation both have a reduced variant). Visible focus rings on every interactive element.

## Conversation memory

`conversationHistory` array, capped at `MAX_HISTORY_MESSAGES = 16` (8 exchanges), mirrored to `localStorage` under `laRecetera.history`. Sent back to Groq every turn as prior messages. Only successful, non-empty replies are pushed into it — errors never pollute context. "Empezar de nuevo" clears both the array and the key (in local mode).

## The API key problem — already solved, don't reintroduce a client-side key

The original version had the Groq key hardcoded in `script.js`. That's fixed. `script.js` must never contain a key again — this ships on GitHub Pages, and anything in a static file is public regardless of obfuscation.

Two supported modes, chosen via `config.js` → `window.RECETERA_CONFIG.proxyUrl`:

- **Proxy mode** (`proxyUrl` set): browser calls the Cloudflare Worker in `worker.js`, which holds `GROQ_API_KEY` as an encrypted Wrangler secret and forwards to Groq. The Worker enforces an origin allowlist, forces the model name, and caps `max_tokens`/message count/total chars server-side, so a leaked Worker URL can't be farmed for free inference.
- **Local mode** (`proxyUrl` empty): the page shows a one-time key-gate (`#keyGate` in `index.html`), validates the key looks like `gsk_...`, and stores it in `localStorage.laRecetera.key`. Never written into any file.

`hasCredentials()` gates `sendMessage`; if neither is present the gate is shown instead of firing a request.

## Error handling in `sendMessage`

60s abort timeout via `AbortController`. `describeHttpError` gives a distinct message per status (401/403, 429, 5xx, generic) in the app's voice, not a stack trace. Every error card gets a "Probar de nuevo" button that removes the failed exchange and re-sends the same user text. Network failure vs. timeout are distinguished in the catch block.

## Dish photos — just reworked, needs live testing

`recipe.image` (a plain dish name like "Bife de chorizo", no adjectives/brand names, model provides the closest known dish if the recipe is invented) feeds `attachPhoto(card, recipe.image || recipe.title)`, which reserves a `<figure class="photo">` slot immediately (card renders instantly) and fills it asynchronously via `findDishPhoto`.

**Current lookup order** (just changed — the previous version did a raw Commons full-text file search, which returned unrelated results, e.g. searching "bistec a la parrilla" surfaced an unrelated 1940s photo of a Santiago restaurant storefront because some file's metadata happened to contain those words):

1. `searchWikipedia('es', query)` — MediaWiki `generator=search` on `es.wikipedia.org`, namespace 0 (articles only), takes the top-ranked result's `pageimage` (the article's own infobox photo, curated by editors — much higher precision than full-text file search).
2. If no es result, `searchWikipedia('en', query)` — same, English Wikipedia, for dishes without a Spanish article.
3. `getCommonsFileInfo(filename)` is called by `searchWikipedia` to resolve the actual file (photographer credit + license + high-res thumb) since Wikipedia article pages only name the file, the file itself with its metadata lives on Commons.
4. If both Wikipedia languages come up empty, `searchOpenverse(query)` as a last resort (keyless, CORS-open, licensed stock photo search — lower precision than Wikipedia but broader coverage of dishes without an encyclopedia article).
5. If all three miss, the `<figure>` is silently removed — no broken image, no placeholder, no error shown to the user.

Every hit **and miss** is cached in `localStorage.laRecetera.photos` (`photoCache`, capped at `PHOTO_CACHE_LIMIT = 60` entries) so reloads don't re-query for dishes already resolved (or already known to have no photo). `PHOTO_TIMEOUT_MS = 8000` per fetch via `fetchWithTimeout`.

Attribution is not decorative — Wikimedia Commons/Openverse content is CC-licensed and requires it. `figcaption` shows `credit · source` with a link to the original file/page. **Do not remove or hide the credit line** when touching this code.

**Not yet done / verify next:**
- This was written and syntax-checked (`node --check`) but never run against live network — the build sandbox has no egress. Test in an actual browser once published: confirm `searchWikipedia` returns sane matches for a range of dish names (classic ones like "milanesa", "locro", regional ones, and invented/compound ones like "milanesa a la napolitana" where the model was told to give the closest known dish name).
- Consider whether `gsrsearch` needs any query cleanup (accents, multi-word dish names with connectors like "a la") — not yet stress-tested.
- Pick cards (`renderPicks`) deliberately have no photos — three thumbnails racing in would fight the choice moment for attention. If the user wants that changed later, it's the same `attachPhoto` call, and thumbnails should be smaller/inline within the `.pick` card, not the full bleed-to-edge treatment used in the recipe view.

## Style notes for the photo block specifically

`.photo` bleeds to the card's own edges (negative margin matching `.recipe`'s padding) so it reads as part of the paper card, not a boxed insert. 16:9 `aspect-ratio`, `object-fit: cover`, fade-in on load (`img.ready` opacity transition, skipped under reduced motion). Caption uses the same italic Fraunces as `.story`/`.col-title`. Mobile breakpoint at 560px adjusts the bleed margin to match `.recipe`'s mobile padding.

## Known constraints to respect

- No React/build tooling — plain DOM APIs only, matches the rest of the codebase.
- No `innerHTML` for anything derived from model output (XSS surface) — only `textContent` and manual node creation, apart from `plainText()` which deliberately uses a detached `<div>` to strip HTML entities from Commons' metadata fields, never to render them.
- Every new fetch call needs a timeout (pattern: `fetchWithTimeout`) and a graceful no-op failure path — this app should never show a raw stack trace or a broken-image icon to a home cook.
