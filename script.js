let isWaiting = false;

// ⚠️ No API key lives in this file, and none should ever be added here.
// This site is published on GitHub Pages: anything in this file is public.
// Two supported setups, both configured in config.js:
//   1. proxyUrl set  -> the key lives in the proxy (worker.js), server-side.
//   2. proxyUrl empty -> local use; the key is typed once by the person using
//      the app and kept in their own browser's localStorage.
const CONFIG = window.RECETERA_CONFIG || {};
const PROXY_URL = (CONFIG.proxyUrl || '').trim();
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const KEY_STORAGE = 'laRecetera.key';
const REQUEST_TIMEOUT_MS = 60000;

const systemPrompt = `Sos "La Recetera", una asistente de cocina argentina con onda.
Respondés siempre en español rioplatense: claro, cálido, directo, sin muletillas ni relleno.
Nunca decís que sos una inteligencia artificial, nunca te disculpás por limitaciones, nunca agregás avisos de que "esto es una IA".

Tenés memoria de toda la conversación: recibís los mensajes anteriores (tuyos y del usuario) como contexto. Usalo. Si el usuario menciona "el paso 3", "la receta de antes" o algo similar sin repetirlo, fijate en los mensajes previos para saber de qué receta o paso está hablando.

Además de dar recetas, tu trabajo incluye:
- Ayudar cuando alguien está trabado en un paso: explicar una técnica, sugerir un reemplazo de ingrediente, o decir qué hacer si algo salió mal.
- Contar datos curiosos sobre comida, ingredientes, técnicas o el origen de un plato, aunque no se haya pedido una receta.
- Charlar y responder dudas generales de cocina que no son un pedido puntual de receta.

Pensá la mejor versión de cada receta con ingredientes fáciles de conseguir en Argentina. El mate es argentino. No sugerís comprar productos raros o carísimos salvo que sea imprescindible para el plato.

Devolvé SIEMPRE un único objeto JSON válido, sin texto antes ni después, sin bloques de código ni backticks. Usá exactamente uno de estos cinco esquemas, según corresponda:

1. El usuario pide cocinar algo y todavía no eligió una versión puntual (por ejemplo "quiero hacer milanesas", "algo con zapallo", "tengo pollo y arroz"): NO das la receta todavía. Ofrecés tres caminos distintos para que elija:
{"type":"picks","text":string,"picks":[{"title":string,"blurb":string,"time":string opcional,"tag":string opcional},{...},{...}]}
- Exactamente 3 opciones, y que sean de verdad distintas entre sí: distinta técnica, dificultad, tiempo, región o vuelta de tuerca. No tres nombres del mismo plato.
- "title": el nombre del plato, corto (hasta unas 6 palabras).
- "blurb": una o dos oraciones que expliquen por qué alguien elegiría esa. Hablale al usuario, sin markdown.
- "time": tiempo total aproximado, tipo "40 min".
- "tag": dos o tres palabras que la distingan, tipo "clásica de domingo", "lo más rápido", "para el horno".
- "text": una línea corta presentando la elección.

2. El usuario ya eligió una de las opciones, pide una receta puntual y concreta, o pide directamente la receta sin vueltas:
{"type":"recipe","title":string,"time":string opcional,"servings":string opcional,"ingredients":string[],"steps":string[],"story":string opcional,"image":string opcional}
- "image": el nombre común del plato tal como lo buscarías en una enciclopedia, para encontrar una foto. Dos o tres palabras, sin "receta de", sin adjetivos y sin marcas: "Milanesa a la napolitana", "Locro", "Pastel de papa". Si el plato es algo inventado o demasiado genérico como para tener foto, omitilo.
- "story" solo si el usuario pidió el origen, la historia o de dónde viene el plato.
- Cada ingrediente y cada paso es una oración en texto plano, sin numerarla vos mismo y sin markdown.
- Los pasos tienen que ser suficientes para cocinar el plato de verdad: temperaturas, tiempos y señales de que algo está listo.

3. El usuario está trabado, pide ayuda con una técnica, un reemplazo de ingrediente, o algo salió mal a mitad de una receta:
{"type":"help","text":string}

4. Un dato curioso, de historia o de cultura sobre comida, que no es un pedido de receta:
{"type":"tip","text":string}

5. Saludos, charla general, o necesitás pedir una aclaración:
{"type":"chat","text":string}

En los esquemas 2, 3, 4 y 5 podés sumar un campo opcional:
"options": array de exactamente 3 strings cortos (unas pocas palabras cada uno), que ofrecen 3 direcciones distintas para seguir la charla — variantes de la receta, una pregunta de seguimiento, un reemplazo, pedir el origen, etc. Escribilos como si fueran algo que el usuario podría escribir (no como botones genéricos tipo "Sí"/"No"). Sumalo solo cuando de verdad haya 3 caminos distintos que tengan sentido; si no, omitilo.
El esquema 1 nunca lleva "options": ahí la elección ya son los "picks".

No agregues claves fuera de estos esquemas.`;

// Conversation memory: sent back to the API on every turn so the bot has
// context, and mirrored to localStorage so it survives a page reload.
// Only successful exchanges are stored — errors never enter the context.
let conversationHistory = [];
const HISTORY_KEY = 'laRecetera.history';
const MAX_HISTORY_MESSAGES = 16; // last 8 exchanges — enough for continuity, without letting the prompt grow forever

const feed = document.getElementById('feed');
const form = document.getElementById('askForm');
const input = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const resetBtn = document.getElementById('resetBtn');
const starters = document.getElementById('starters');
const keyGate = document.getElementById('keyGate');
const keyForm = document.getElementById('keyForm');
const keyInput = document.getElementById('keyInput');
const keyError = document.getElementById('keyError');

form.addEventListener('submit', (e) => {
  e.preventDefault();
  sendMessage();
});

input.addEventListener('input', syncSendBtn);
resetBtn.addEventListener('click', resetConversation);

keyForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const value = keyInput.value.trim();
  if (!value.startsWith('gsk_') || value.length < 20) {
    keyError.hidden = false;
    return;
  }
  keyError.hidden = true;
  try { localStorage.setItem(KEY_STORAGE, value); } catch (err) { /* stored in memory only */ }
  savedKey = value;
  keyInput.value = '';
  keyGate.hidden = true;
  input.focus();
});

document.querySelectorAll('.starter').forEach(btn => {
  btn.addEventListener('click', () => sendMessage(btn.textContent));
});

let savedKey = readSavedKey();

loadHistory();
syncSendBtn();
syncChrome();
if (!hasCredentials()) keyGate.hidden = false;

function readSavedKey() {
  try {
    return localStorage.getItem(KEY_STORAGE) || '';
  } catch (e) {
    return '';
  }
}

function hasCredentials() {
  return Boolean(PROXY_URL || savedKey);
}

function syncSendBtn() {
  sendBtn.disabled = isWaiting || input.value.trim() === '';
}

function syncChrome() {
  const hasContent = feed.children.length > 0;
  starters.hidden = hasContent;
  resetBtn.hidden = !hasContent;
}

async function sendMessage(presetText) {
  const userMessage = (presetText !== undefined ? presetText : input.value).trim();
  if (!userMessage || isWaiting) return;

  if (!hasCredentials()) {
    keyGate.hidden = false;
    keyInput.focus();
    return;
  }

  isWaiting = true;
  input.value = '';
  syncSendBtn();

  const exchange = createExchangeWithQuery(userMessage);
  feed.appendChild(exchange);
  syncChrome();
  scrollToBottom();

  const loadingEl = createLoadingEl();
  exchange.appendChild(loadingEl);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (!PROXY_URL) headers['Authorization'] = `Bearer ${savedKey}`;

    const response = await fetch(PROXY_URL || GROQ_URL, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        messages: [
          { role: "system", content: systemPrompt },
          ...conversationHistory,
          { role: "user", content: userMessage }
        ],
        max_tokens: 1400,
        temperature: 0.7,
        response_format: { type: "json_object" }
      })
    });

    let data = {};
    try { data = await response.json(); } catch (e) { data = {}; }

    if (exchange.contains(loadingEl)) exchange.removeChild(loadingEl);

    if (!response.ok) {
      renderError(exchange, describeHttpError(response.status, data), userMessage);
      return;
    }

    const raw = data.choices?.[0]?.message?.content ?? '';
    const parsed = parseBotJSON(raw);

    if (!raw) {
      renderError(exchange, 'La respuesta llegó vacía. Probá de nuevo.', userMessage);
      return;
    }

    renderAssistantReply(exchange, parsed, raw);

    // Only remember turns that actually produced something —
    // a failed/empty reply shouldn't pollute future context.
    conversationHistory.push({ role: 'user', content: userMessage });
    conversationHistory.push({ role: 'assistant', content: raw });
    trimHistory();
    saveHistory();

  } catch (err) {
    if (exchange.contains(loadingEl)) exchange.removeChild(loadingEl);
    const message = err.name === 'AbortError'
      ? 'La respuesta tardó demasiado. Probá de nuevo.'
      : 'No hay conexión con la cocina. Revisá internet y probá de nuevo.';
    renderError(exchange, message, userMessage);
  } finally {
    clearTimeout(timeout);
    isWaiting = false;
    syncSendBtn();
    scrollToBottom();
  }
}

function describeHttpError(status, data) {
  if (status === 401 || status === 403) {
    return PROXY_URL
      ? 'El servidor rechazó el pedido. Revisá la configuración del proxy.'
      : 'La clave guardada no sirve. Tocá "Empezar de nuevo" y cargá una clave válida.';
  }
  if (status === 429) return 'Hubo demasiados pedidos seguidos. Esperá unos segundos y probá otra vez.';
  if (status >= 500) return 'La cocina está sobrecargada del otro lado. Probá de nuevo en un momento.';
  return data?.error?.message || 'Algo falló al pedir la respuesta. Probá de nuevo.';
}

function resetConversation() {
  conversationHistory = [];
  try { localStorage.removeItem(HISTORY_KEY); } catch (e) { /* storage unavailable — nothing to clear */ }
  feed.innerHTML = '';
  input.value = '';
  syncSendBtn();
  syncChrome();
  if (!PROXY_URL) {
    try { localStorage.removeItem(KEY_STORAGE); } catch (e) { /* nothing to clear */ }
    savedKey = '';
    keyGate.hidden = false;
    keyInput.focus();
    return;
  }
  input.focus();
}

function trimHistory() {
  if (conversationHistory.length > MAX_HISTORY_MESSAGES) {
    conversationHistory = conversationHistory.slice(conversationHistory.length - MAX_HISTORY_MESSAGES);
  }
}

function saveHistory() {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(conversationHistory));
  } catch (e) { /* private/blocked storage — memory still works for this tab */ }
}

function loadHistory() {
  let saved = null;
  try {
    saved = localStorage.getItem(HISTORY_KEY);
  } catch (e) { /* storage unavailable */ }
  if (!saved) return;

  let history;
  try {
    history = JSON.parse(saved);
  } catch (e) {
    return;
  }
  if (!Array.isArray(history)) return;

  conversationHistory = history;

  for (let i = 0; i < conversationHistory.length; i += 2) {
    const userMsg = conversationHistory[i];
    const botMsg = conversationHistory[i + 1];
    if (!userMsg || !botMsg || userMsg.role !== 'user' || botMsg.role !== 'assistant') continue;

    // What the person typed next — used to re-mark which card they picked.
    const nextUserMsg = conversationHistory[i + 2];
    const nextText = nextUserMsg && nextUserMsg.role === 'user' ? nextUserMsg.content : '';

    const exchange = createExchangeWithQuery(userMsg.content);
    feed.appendChild(exchange);
    renderAssistantReply(exchange, parseBotJSON(botMsg.content), botMsg.content, nextText);
  }

  if (conversationHistory.length > 0) {
    scrollToBottom();
  }
}

function createExchangeWithQuery(text) {
  const exchange = document.createElement('div');
  exchange.className = 'exchange';

  const queryEl = document.createElement('div');
  queryEl.className = 'query';
  queryEl.textContent = text;
  exchange.appendChild(queryEl);

  return exchange;
}

function createLoadingEl() {
  const loadingEl = document.createElement('div');
  loadingEl.className = 'loading';
  loadingEl.innerHTML = 'Pensando <span class="dots"><span></span><span></span><span></span></span>';
  return loadingEl;
}

function scrollToBottom() {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: document.body.scrollHeight, behavior: reduce ? 'auto' : 'smooth' });
}

function parseBotJSON(raw) {
  if (!raw) return null;

  const tryParse = (text) => {
    try {
      return { ok: true, value: JSON.parse(text) };
    } catch (e) {
      return { ok: false };
    }
  };

  const cleaned = raw
    .trim()
    .replace(/^```json/i, '')
    .replace(/^```/, '')
    .replace(/```$/, '')
    .trim();

  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;

  const candidate = cleaned.slice(start, end + 1);

  const first = tryParse(candidate);
  if (first.ok) return first.value;

  // The model occasionally breaks strict JSON in small, predictable ways —
  // a literal line break inside a string, smart quotes, a trailing comma.
  // Try to repair those before giving up and falling back to raw text.
  const repaired = candidate
    .replace(/[\r\n]+/g, ' ')
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/,\s*([}\]])/g, '$1');

  const second = tryParse(repaired);
  return second.ok ? second.value : null;
}

function renderAssistantReply(exchange, parsed, raw, nextUserText) {
  let rendered = true;

  if (isPicks(parsed)) {
    renderPicks(exchange, parsed, nextUserText);
    return; // the cards *are* the follow-up choice — no extra options here
  } else if (
    parsed &&
    parsed.type === 'recipe' &&
    parsed.title &&
    Array.isArray(parsed.ingredients) &&
    Array.isArray(parsed.steps)
  ) {
    renderRecipe(exchange, parsed);
  } else if (parsed && parsed.type === 'help' && parsed.text) {
    renderChat(exchange, parsed.text, 'help');
  } else if (parsed && parsed.type === 'tip' && parsed.text) {
    renderChat(exchange, parsed.text, 'tip');
  } else if (parsed && parsed.type === 'chat' && parsed.text) {
    renderChat(exchange, parsed.text);
  } else if (raw) {
    renderChat(exchange, raw);
    rendered = false; // unstructured fallback text — no options to trust here
  } else {
    renderError(exchange, 'No llegó ninguna respuesta.');
    rendered = false;
  }

  if (rendered && parsed) {
    renderChoices(exchange, parsed.options);
  }
}

function isPicks(parsed) {
  return Boolean(
    parsed &&
    parsed.type === 'picks' &&
    Array.isArray(parsed.picks) &&
    parsed.picks.length >= 2 &&
    parsed.picks.every(p => p && typeof p.title === 'string' && p.title.trim())
  );
}

// Three routes to the same craving, laid out as cards you choose between.
// Picking one dims the paths not taken and asks for the full recipe.
function renderPicks(exchange, data, chosenHint) {
  if (data.text) {
    const intro = document.createElement('div');
    intro.className = 'picks-intro';
    intro.textContent = data.text;
    exchange.appendChild(intro);
  }

  const wrap = document.createElement('div');
  wrap.className = 'picks';

  const picks = data.picks.slice(0, 3);
  const cards = [];

  picks.forEach(pick => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'pick';

    const title = document.createElement('span');
    title.className = 'pick-title';
    title.textContent = pick.title;
    card.appendChild(title);

    if (pick.time || pick.tag) {
      const meta = document.createElement('span');
      meta.className = 'pick-meta';
      if (pick.tag) {
        const t = document.createElement('span');
        t.textContent = pick.tag;
        meta.appendChild(t);
      }
      if (pick.time) {
        const t = document.createElement('span');
        t.textContent = pick.time;
        meta.appendChild(t);
      }
      card.appendChild(meta);
    }

    if (pick.blurb) {
      const blurb = document.createElement('span');
      blurb.className = 'pick-blurb';
      blurb.textContent = pick.blurb;
      card.appendChild(blurb);
    }

    const cta = document.createElement('span');
    cta.className = 'pick-cta';
    cta.textContent = 'Cocinar esta';
    card.appendChild(cta);

    card.addEventListener('click', () => {
      if (isWaiting || wrap.classList.contains('locked')) return;
      lockPicks(wrap, cards, card);
      sendMessage(`Elijo "${pick.title}". Pasame la receta completa.`);
    });

    cards.push(card);
    wrap.appendChild(card);
  });

  exchange.appendChild(wrap);

  // Re-mark the card that was chosen in a previous session.
  if (chosenHint) {
    const hint = chosenHint.toLowerCase();
    const index = picks.findIndex(p => hint.includes(p.title.toLowerCase()));
    if (index !== -1) lockPicks(wrap, cards, cards[index]);
  }
}

function lockPicks(wrap, cards, chosenCard) {
  wrap.classList.add('locked');
  cards.forEach(card => {
    card.disabled = true;
    card.classList.add(card === chosenCard ? 'chosen' : 'dimmed');
  });
}

function renderChoices(exchange, options) {
  if (!Array.isArray(options)) return;

  const clean = options
    .filter(opt => typeof opt === 'string' && opt.trim())
    .slice(0, 3);
  if (clean.length === 0) return;

  const wrap = document.createElement('div');
  wrap.className = 'choices';

  clean.forEach(optionText => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'choice';
    btn.textContent = optionText;
    btn.addEventListener('click', () => {
      if (isWaiting) return;
      sendMessage(optionText);
    });
    wrap.appendChild(btn);
  });

  exchange.appendChild(wrap);
}

function renderChat(exchange, text, variant) {
  const el = document.createElement('div');
  el.className = variant ? `chat-reply ${variant}` : 'chat-reply';
  el.textContent = text;
  exchange.appendChild(el);
}

function renderError(exchange, message, retryText) {
  const el = document.createElement('div');
  el.className = 'error-reply';

  const text = document.createElement('p');
  text.textContent = message;
  el.appendChild(text);

  if (retryText) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'retry-btn';
    btn.textContent = 'Probar de nuevo';
    btn.addEventListener('click', () => {
      if (isWaiting) return;
      exchange.remove();
      syncChrome();
      sendMessage(retryText);
    });
    el.appendChild(btn);
  }

  exchange.appendChild(el);
}

function renderRecipe(exchange, recipe) {
  const card = document.createElement('div');
  card.className = 'recipe';

  attachPhoto(card, recipe.image || recipe.title);

  const h2 = document.createElement('h2');
  h2.textContent = recipe.title;
  card.appendChild(h2);

  if (recipe.time || recipe.servings) {
    const meta = document.createElement('div');
    meta.className = 'meta';

    if (recipe.time) {
      const s = document.createElement('span');
      s.textContent = recipe.time;
      meta.appendChild(s);
    }

    if (recipe.servings) {
      const s = document.createElement('span');
      s.textContent = recipe.servings;
      meta.appendChild(s);
    }

    card.appendChild(meta);
  }

  card.appendChild(document.createElement('hr'));

  const columns = document.createElement('div');
  columns.className = 'recipe-columns';

  const ingCol = document.createElement('div');

  const ingTitle = document.createElement('div');
  ingTitle.className = 'col-title';
  ingTitle.textContent = 'Ingredientes';
  ingCol.appendChild(ingTitle);

  const ul = document.createElement('ul');
  ul.className = 'ingredients';

  recipe.ingredients.forEach(item => {
    const li = document.createElement('li');
    li.textContent = item;
    ul.appendChild(li);
  });

  ingCol.appendChild(ul);
  columns.appendChild(ingCol);

  const stepCol = document.createElement('div');

  const stepTitle = document.createElement('div');
  stepTitle.className = 'col-title';
  stepTitle.textContent = 'Preparación';
  stepCol.appendChild(stepTitle);

  const ol = document.createElement('ol');
  ol.className = 'steps';

  recipe.steps.forEach(step => {
    const li = document.createElement('li');
    li.textContent = step;
    ol.appendChild(li);
  });

  stepCol.appendChild(ol);
  columns.appendChild(stepCol);

  card.appendChild(columns);

  if (recipe.story) {
    const story = document.createElement('div');
    story.className = 'story';
    story.textContent = recipe.story;
    card.appendChild(story);
  }

  exchange.appendChild(card);
}

// ---- Dish photos -------------------------------------------------------
// Wikimedia Commons first, Openverse as a fallback. Both are keyless and
// CORS-enabled, so this needs no proxy and nothing to configure, and both
// serve freely licensed work — which is why every photo carries its credit.
// A miss is silent: the card simply renders without a photo, and the miss is
// remembered so a reload doesn't re-ask for a dish that has no picture.
const PHOTO_CACHE_KEY = 'laRecetera.photos';
const PHOTO_CACHE_LIMIT = 60;
const PHOTO_TIMEOUT_MS = 8000;

let photoCache = readPhotoCache();

function readPhotoCache() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PHOTO_CACHE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    return {};
  }
}

function savePhotoCache() {
  const keys = Object.keys(photoCache);
  if (keys.length > PHOTO_CACHE_LIMIT) {
    keys.slice(0, keys.length - PHOTO_CACHE_LIMIT).forEach(k => { delete photoCache[k]; });
  }
  try {
    localStorage.setItem(PHOTO_CACHE_KEY, JSON.stringify(photoCache));
  } catch (e) { /* storage unavailable — cache lives for this tab only */ }
}

// Reserves the space, then fills it. Keeps the recipe readable immediately
// instead of blocking the card on a second network round trip.
function attachPhoto(card, query) {
  const term = (query || '').trim();
  if (!term) return;

  const figure = document.createElement('figure');
  figure.className = 'photo';

  const frame = document.createElement('div');
  frame.className = 'photo-frame';
  figure.appendChild(frame);

  card.appendChild(figure);

  findDishPhoto(term).then(photo => {
    if (!photo || !photo.url) {
      figure.remove();
      return;
    }

    const img = document.createElement('img');
    img.alt = `Foto de ${term}`;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.addEventListener('load', () => figure.classList.add('ready'));
    img.addEventListener('error', () => figure.remove());
    img.src = photo.url;
    frame.appendChild(img);

    const caption = document.createElement('figcaption');
    const credit = [photo.credit, photo.source].filter(Boolean).join(' · ');
    if (photo.href) {
      const link = document.createElement('a');
      link.href = photo.href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = credit || 'Ver la foto';
      caption.appendChild(link);
    } else {
      caption.textContent = credit;
    }
    if (caption.textContent) figure.appendChild(caption);
  }).catch(() => figure.remove());
}

async function findDishPhoto(query) {
  const key = query.toLowerCase();
  if (Object.prototype.hasOwnProperty.call(photoCache, key)) return photoCache[key];

  // Wikipedia's own infobox photo for the dish's article, not a raw keyword
  // search over every file on Commons — a full-text file search on a generic
  // word like "bistec" or "pastel" matches whatever unrelated upload happens
  // to mention it, which is exactly the kind of miss that erodes trust in
  // the whole feature. es first (this is an Argentine cooking app), en as
  // a fallback for dishes without a Spanish article, Openverse last.
  let photo = null;
  try {
    photo = await searchWikipedia('es', key);
  } catch (e) { /* try the next source */ }

  if (!photo) {
    try {
      photo = await searchWikipedia('en', key);
    } catch (e) { /* try the next source */ }
  }

  if (!photo) {
    try {
      photo = await searchOpenverse(key);
    } catch (e) { /* no photo for this dish */ }
  }

  photoCache[key] = photo;
  savePhotoCache();
  return photo;
}

async function searchWikipedia(lang, query) {
  const searchParams = new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    generator: 'search',
    gsrsearch: query,
    gsrnamespace: '0',
    gsrlimit: '3',
    prop: 'pageimages|info',
    piprop: 'name',
    inprop: 'url'
  });

  const res = await fetchWithTimeout(`https://${lang}.wikipedia.org/w/api.php?${searchParams}`);
  if (!res.ok) return null;

  const data = await res.json();
  const pages = Object.values(data?.query?.pages || {});
  // gsrsearch already ranks by relevance; take the first result that has an
  // infobox photo at all rather than picking the "best" match ourselves.
  const withPhoto = pages
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .find(p => p.pageimage);
  if (!withPhoto) return null;

  const fileInfo = await getCommonsFileInfo(withPhoto.pageimage);
  if (!fileInfo) return null;

  return { ...fileInfo, href: withPhoto.fullurl || fileInfo.href, source: `Wikipedia (${lang})` };
}

// The dish's article names its infobox photo but the file itself, with its
// author and license, lives on Commons — one more call to fetch that credit
// properly instead of leaving the photo uncredited.
async function getCommonsFileInfo(filename) {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    origin: '*',
    titles: `File:${filename}`,
    prop: 'imageinfo',
    iiprop: 'url|mime|extmetadata',
    iiurlwidth: '900'
  });

  const res = await fetchWithTimeout(`https://commons.wikimedia.org/w/api.php?${params}`);
  if (!res.ok) return null;

  const data = await res.json();
  const pages = Object.values(data?.query?.pages || {});
  const info = pages[0]?.imageinfo?.[0];
  if (!info || !info.thumburl) return null;
  if (!/^image\/(jpeg|png|webp)$/.test(info.mime || '')) return null;

  const meta = info.extmetadata || {};
  return {
    url: info.thumburl,
    credit: [plainText(meta.Artist?.value), plainText(meta.LicenseShortName?.value)]
      .filter(Boolean)
      .join(', '),
    href: info.descriptionurl || null
  };
}

async function searchOpenverse(query) {
  const params = new URLSearchParams({
    q: query,
    page_size: '6',
    mature: 'false'
  });

  const res = await fetchWithTimeout(`https://api.openverse.org/v1/images/?${params}`);
  if (!res.ok) return null;

  const data = await res.json();
  const hit = (data?.results || []).find(r => r && (r.thumbnail || r.url));
  if (!hit) return null;

  return {
    url: hit.thumbnail || hit.url,
    credit: [plainText(hit.creator), plainText(hit.license_version ? `${hit.license} ${hit.license_version}` : hit.license)]
      .filter(Boolean)
      .join(', '),
    source: 'Openverse',
    href: hit.foreign_landing_url || null
  };
}

// Commons returns HTML in its metadata fields — take the text and trim it to
// something that fits on one caption line.
function plainText(value) {
  if (!value) return '';
  const holder = document.createElement('div');
  holder.innerHTML = value;
  const text = (holder.textContent || '').replace(/\s+/g, ' ').trim();
  return text.length > 60 ? `${text.slice(0, 59)}…` : text;
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PHOTO_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}
