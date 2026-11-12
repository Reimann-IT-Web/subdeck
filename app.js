'use strict';
/* Subdeck: Reddit in Spalten. Läuft komplett im Browser, Daten kommen direkt von reddit.com. */
(() => {
  // ---------------------------------------------------------------- Grundlagen
  // Daten kommen von api.reddit.com: www.reddit.com/*.json blockt Abrufe per Skript inzwischen,
  // auch für angemeldete Nutzer. Links zum Anklicken zeigen weiter auf www.reddit.com.
  const DATA = 'https://api.reddit.com';
  const WEB = 'https://www.reddit.com';
  const LOGIN_URL = WEB + '/login/';
  const extApi = (() => {
    try {
      if (globalThis.browser?.runtime?.id) return globalThis.browser;
      if (globalThis.chrome?.runtime?.id) return globalThis.chrome;
    } catch { /* kein Erweiterungskontext */ }
    return null;
  })();
  const IS_EXT = !!extApi;
  const HOST = { origins: ['https://api.reddit.com/*', 'https://www.reddit.com/*'] };
  const KEY = 'subdeck.v1';
  const READ_KEY = 'subdeck.read.v1';
  const MIN_GAP = 1100;      // Mindestabstand zwischen zwei Anfragen an Reddit (ms)
  const PAGE = 30;
  const MAX_POSTS = 300;
  const READ_CAP = 4000;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Math.random().toString(36).slice(2, 10);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const icon = (id) => `<svg class="ic" aria-hidden="true"><use href="#i-${id}"/></svg>`;

  const TYPES = {
    sub:    { field: 'Subreddit', ph: 'z. B. de oder de+germany', sorts: ['hot', 'new', 'top', 'rising', 'controversial'], def: 'hot' },
    search: { field: 'Suchbegriff', ph: 'z. B. Deutsche Bahn', sorts: ['new', 'relevance', 'top', 'comments'], def: 'new' },
    user:   { field: 'Nutzer', ph: 'Nutzername', sorts: ['new', 'hot', 'top'], def: 'new' },
    home:   { field: '', ph: '', sorts: ['best', 'hot', 'new', 'top', 'rising'], def: 'best' },
  };
  const SORT_LABEL = { hot: 'Angesagt', new: 'Neu', top: 'Top', rising: 'Im Kommen', controversial: 'Umstritten', relevance: 'Relevanz', comments: 'Meiste Kommentare', best: 'Beste' };
  const T_LABEL = { hour: 'Letzte Stunde', day: 'Heute', week: 'Diese Woche', month: 'Dieser Monat', year: 'Dieses Jahr', all: 'Allzeit' };
  const REFRESH = [0, 1, 2, 5, 10, 15, 30];
  const WIDTH_LABEL = { s: 'Schmal', m: 'Mittel', l: 'Breit' };
  const COMMENT_SORTS = { confidence: 'Beste', top: 'Top', new: 'Neu', controversial: 'Umstritten', old: 'Älteste', qa: 'Fragen & Antworten' };
  const SUGGEST = ['popular', 'all', 'de', 'germany', 'de_EDV', 'Finanzen', 'worldnews', 'technology', 'science', 'dataisbeautiful'];
  const usesT = (c) => (c.type === 'search' ? c.sort !== 'new' : ['top', 'controversial'].includes(c.sort));

  const DEFAULT_SETTINGS = { theme: 'system', density: 'normal', media: 'small', hideNsfw: true, hidePinned: false, dimRead: true, bgRefresh: false, mute: [] };
  const defaultColumns = () => [
    { id: uid(), type: 'sub', target: 'popular', sub: '', sort: 'hot', t: 'day', refresh: 5, width: 'm', name: '' },
    { id: uid(), type: 'sub', target: 'de', sub: '', sort: 'new', t: 'day', refresh: 2, width: 'm', name: '' },
    { id: uid(), type: 'sub', target: 'worldnews', sub: '', sort: 'hot', t: 'day', refresh: 5, width: 'm', name: '' },
    { id: uid(), type: 'search', target: 'Deutsche Bahn', sub: '', sort: 'new', t: 'week', refresh: 10, width: 'm', name: '' },
  ];

  // ---------------------------------------------------------------- Speicher
  function normCol(c) {
    if (!c || !TYPES[c.type]) return null;
    const sorts = TYPES[c.type].sorts;
    const col = {
      id: String(c.id || uid()),
      type: c.type,
      target: String(c.target || '').slice(0, 200),
      sub: String(c.sub || '').slice(0, 100),
      sort: sorts.includes(c.sort) ? c.sort : TYPES[c.type].def,
      t: T_LABEL[c.t] ? c.t : 'day',
      refresh: REFRESH.includes(+c.refresh) ? +c.refresh : 5,
      width: WIDTH_LABEL[c.width] ? c.width : 'm',
      name: String(c.name || '').slice(0, 40),
    };
    if (col.type !== 'home' && !col.target) return null;
    return col;
  }
  function normSettings(s) {
    const out = { ...DEFAULT_SETTINGS, ...(s && typeof s === 'object' ? s : {}) };
    if (!['system', 'light', 'dark'].includes(out.theme)) out.theme = 'system';
    if (!['normal', 'compact'].includes(out.density)) out.density = 'normal';
    if (!['off', 'small', 'large'].includes(out.media)) out.media = 'small';
    out.mute = Array.isArray(out.mute) ? out.mute.map(String).filter(Boolean).slice(0, 200) : [];
    return out;
  }
  function loadState() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw);
        const cols = Array.isArray(s.columns) ? s.columns.map(normCol).filter(Boolean) : null;
        return { columns: cols || defaultColumns(), settings: normSettings(s.settings) };
      }
    } catch { /* kaputter Speicher: Standard verwenden */ }
    return { columns: defaultColumns(), settings: normSettings() };
  }
  const state = loadState();
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify({ v: 1, columns: state.columns, settings: state.settings })); } catch { /* egal */ }
  }

  let readList = [];
  try { readList = JSON.parse(localStorage.getItem(READ_KEY) || '[]'); if (!Array.isArray(readList)) readList = []; } catch { readList = []; }
  const readSet = new Set(readList);
  function markRead(id) {
    if (!id || readSet.has(id)) return;
    readSet.add(id);
    readList.push(id);
    if (readList.length > READ_CAP) readList.splice(0, readList.length - READ_CAP).forEach((x) => readSet.delete(x));
    try { localStorage.setItem(READ_KEY, JSON.stringify(readList)); } catch { /* egal */ }
    $$(`.post[data-id="${id}"]`).forEach((el) => el.classList.add('is-read'));
  }

  // ---------------------------------------------------------------- Formatierung
  const rtf = new Intl.RelativeTimeFormat('de', { numeric: 'auto', style: 'short' });
  function rel(ts) {
    const s = (Date.now() - ts) / 1000;
    if (s < 45) return 'gerade eben';
    if (s < 3600) return rtf.format(-Math.round(s / 60), 'minute');
    if (s < 86400) return rtf.format(-Math.round(s / 3600), 'hour');
    if (s < 7 * 86400) return rtf.format(-Math.round(s / 86400), 'day');
    return new Date(ts).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: s > 300 * 86400 ? 'numeric' : undefined });
  }
  const clock = (ts) => new Date(ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const fullDate = (ts) => new Date(ts).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
  function num(n) {
    n = Math.round(+n || 0);
    const a = Math.abs(n);
    const dec = (v) => v.toFixed(1).replace('.', ',').replace(/,0$/, '');
    if (a < 1000) return String(n);
    if (a < 10000) return dec(n / 1000) + 'k';
    if (a < 1e6) return Math.round(n / 1000) + 'k';
    return dec(n / 1e6) + ' Mio.';
  }
  function plain(md, max) {
    let t = String(md || '')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/^[\s#>*+-]+/gm, '')
      .replace(/[*_~`^]+/g, '')
      .replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim();
    if (t.length > max) t = t.slice(0, max).replace(/\s+\S*$/, '') + ' …';
    return t;
  }
  const absUrl = (u) => (!u ? '' : /^https?:\/\//i.test(u) ? u : u.startsWith('/') ? WEB + u : '');
  const shortUrl = (u) => String(u || '').replace(/^https?:\/\/(www\.)?/i, '').slice(0, 90);

  // Reddit liefert HTML für Texte und Kommentare. Nur harmlose Elemente übernehmen.
  const ALLOWED = new Set(['P', 'BR', 'A', 'STRONG', 'B', 'EM', 'I', 'DEL', 'S', 'SUP', 'SUB', 'CODE', 'PRE', 'BLOCKQUOTE', 'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HR', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'SPAN', 'DIV']);
  const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'TEMPLATE', 'svg', 'SVG', 'MATH', 'FORM', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT', 'LINK', 'META']);
  const IMG_HOST = /^https:\/\/(preview\.redd\.it|i\.redd\.it|i\.imgur\.com)\//i;
  function sanitize(html) {
    if (!html) return '';
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const out = document.createElement('div');
    const walk = (src, dst) => {
      for (const n of src.childNodes) {
        if (n.nodeType === 3) { dst.appendChild(document.createTextNode(n.textContent)); continue; }
        if (n.nodeType !== 1) continue;
        const tag = n.tagName;
        if (DROP.has(tag)) continue;
        if (!ALLOWED.has(tag)) { walk(n, dst); continue; }
        if (tag === 'A') {
          const href = absUrl(n.getAttribute('href') || '');
          const text = n.textContent.trim();
          if (href && IMG_HOST.test(href) && (text === href || /^https?:\/\//.test(text) || text === '')) {
            const img = document.createElement('img');
            img.src = href; img.alt = ''; img.loading = 'lazy'; img.className = 'md-img';
            const a = document.createElement('a');
            a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer';
            a.appendChild(img); dst.appendChild(a);
            continue;
          }
          const a = document.createElement('a');
          if (href) { a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; }
          walk(n, a); dst.appendChild(a);
          continue;
        }
        const el = document.createElement(tag);
        if (tag === 'SPAN' && n.classList.contains('md-spoiler-text')) el.className = 'spoiler';
        if ((tag === 'TH' || tag === 'TD') && /^(left|right|center)$/.test(n.getAttribute('align') || '')) el.style.textAlign = n.getAttribute('align');
        walk(n, el); dst.appendChild(el);
      }
    };
    walk(doc.body, out);
    return out.innerHTML;
  }

  // ---------------------------------------------------------------- Netzwerk
  class ApiError extends Error {
    constructor(kind, message) { super(message); this.kind = kind; }
  }
  const net = { queue: [], busy: false, last: 0, pauseUntil: 0, remaining: null, resetAt: 0 };

  function rget(path, params = {}, { priority = false } = {}) {
    // api.reddit.com liefert JSON ohne die .json-Endung der www-Adressen.
    const url = new URL(DATA + path.replace(/\.json$/, ''));
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    url.searchParams.set('raw_json', '1');
    return new Promise((resolve, reject) => {
      const job = { url, resolve, reject };
      if (priority) net.queue.unshift(job); else net.queue.push(job);
      pump();
    });
  }
  async function pump() {
    if (net.busy) return;
    net.busy = true;
    try {
      while (net.queue.length) {
        const wait = Math.max(net.last + MIN_GAP - Date.now(), net.pauseUntil - Date.now(), 0);
        if (wait) await sleep(wait);
        const job = net.queue.shift();
        if (!job) break;
        net.last = Date.now();
        try { job.resolve(await doFetch(job.url)); } catch (e) { job.reject(e); }
      }
    } finally {
      net.busy = false;
    }
  }
  async function doFetch(url) {
    let res;
    try {
      res = await fetch(url, { credentials: IS_EXT ? 'include' : 'omit', headers: { Accept: 'application/json' }, cache: 'no-store' });
    } catch {
      throw new ApiError('network', IS_EXT
        ? 'Keine Verbindung zu Reddit. Prüfe deine Internetverbindung.'
        : 'Der Browser lässt diese Seite nicht direkt auf Reddit zugreifen. Installiere Subdeck als Erweiterung.');
    }
    readRate(res);
    if (res.status === 429) {
      const wait = net.resetAt > Date.now() ? net.resetAt - Date.now() : 60000;
      net.pauseUntil = Date.now() + Math.max(10000, wait);
      throw new ApiError('rate', `Reddit bremst gerade. Nächster Versuch ab ${clock(net.pauseUntil)}.`);
    }
    const type = res.headers.get('content-type') || '';
    if (!type.includes('json')) {
      throw new ApiError('blocked', 'Reddit lässt Subdeck nur mit Anmeldung laden. Melde dich in diesem Browser bei reddit.com an. Sobald du zu Subdeck zurückkehrst, lädt es neu.');
    }
    const body = await res.json().catch(() => null);
    if (res.redirected && /\/subreddits\/search/.test(res.url)) throw new ApiError('notfound', 'Dieses Subreddit gibt es nicht.');
    if (res.status === 403) {
      const why = body?.reason;
      throw new ApiError('private', why === 'private' ? 'Dieses Subreddit ist privat.'
        : why === 'quarantined' ? 'Dieses Subreddit steht unter Quarantäne und ist nur auf reddit.com sichtbar.'
        : why === 'gold_only' ? 'Dieses Subreddit ist nur für Premium-Mitglieder.'
        : 'Reddit verweigert den Zugriff.');
    }
    if (res.status === 404) throw new ApiError('notfound', body?.reason === 'banned' ? 'Dieses Subreddit wurde gesperrt.' : 'Nicht gefunden.');
    if (!res.ok || !body) throw new ApiError('http', `Reddit antwortet mit Fehler ${res.status}.`);
    return body;
  }
  function readRate(res) {
    const rem = parseFloat(res.headers.get('x-ratelimit-remaining'));
    const reset = parseFloat(res.headers.get('x-ratelimit-reset'));
    if (Number.isNaN(rem)) return;
    net.remaining = rem;
    net.resetAt = Date.now() + (Number.isNaN(reset) ? 0 : reset * 1000);
    if (rem < 3 && !Number.isNaN(reset)) net.pauseUntil = Math.max(net.pauseUntil, net.resetAt);
    renderRate();
  }

  // ---------------------------------------------------------------- Reddit-Daten
  function listingRequest(c, after) {
    const p = { limit: PAGE };
    if (after) p.after = after;
    if (usesT(c)) p.t = c.t;
    switch (c.type) {
      case 'sub': return { path: `/r/${c.target}/${c.sort}.json`, params: p };
      case 'home': return { path: `/${c.sort}.json`, params: p };
      case 'user': return { path: `/user/${c.target}/submitted.json`, params: { ...p, sort: c.sort } };
      case 'search': {
        const params = { ...p, q: c.target, sort: c.sort, type: 'link' };
        if (c.sub) params.restrict_sr = 'on';
        return { path: c.sub ? `/r/${c.sub}/search.json` : '/search.json', params };
      }
    }
    throw new Error('Unbekannter Spaltentyp');
  }
  function parseListing(body) {
    const kids = body?.data?.children;
    if (!Array.isArray(kids)) throw new ApiError('http', 'Unerwartete Antwort von Reddit.');
    if (kids.length && kids.every((k) => k.kind === 't5')) throw new ApiError('notfound', 'Dieses Subreddit gibt es nicht.');
    return { posts: kids.filter((k) => k.kind === 't3' && k.data).map((k) => normPost(k.data)), after: body.data.after || null };
  }
  const pickRes = (list, min) => (Array.isArray(list) && list.length ? list.find((r) => (r.width || r.x) >= min) || list[list.length - 1] : null);
  const thumbOf = (d) => (/^https?:/.test(d.thumbnail || '') ? d.thumbnail : null);
  function extractMedia(d) {
    const x = d.crosspost_parent_list?.[0];
    const s = x && !d.preview && !d.media_metadata && !d.secure_media?.reddit_video ? x : d;
    if (s.is_gallery && s.media_metadata && s.gallery_data?.items) {
      const items = s.gallery_data.items.map((it) => {
        const m = s.media_metadata[it.media_id];
        if (!m || m.status !== 'valid' || !m.s) return null;
        const full = m.s.u || m.s.gif || m.s.mp4;
        const mid = pickRes(m.p, 640);
        const small = pickRes(m.p, 140);
        return { full, src: mid?.u || full, thumb: small?.u || mid?.u || full, w: m.s.x, h: m.s.y, caption: it.caption || '' };
      }).filter((i) => i && i.src);
      if (items.length) return { kind: 'gallery', items, src: items[0].src, thumb: items[0].thumb, w: items[0].w, h: items[0].h, full: items[0].full };
    }
    const img = s.preview?.images?.[0];
    const poster = img ? (pickRes(img.resolutions, 640)?.url || img.source?.url) : null;
    const smallImg = img ? (pickRes(img.resolutions, 140)?.url || poster) : null;
    const v = s.secure_media?.reddit_video || s.media?.reddit_video || s.preview?.reddit_video_preview;
    if (v?.fallback_url) {
      return { kind: 'video', video: v.fallback_url, gif: !!v.is_gif, src: poster, thumb: smallImg || thumbOf(s), w: v.width, h: v.height };
    }
    if (img?.source?.url) {
      const isImage = s.post_hint === 'image' || /\.(jpe?g|png|webp|gif)(\?|$)/i.test(s.url || '');
      return {
        kind: isImage ? 'image' : s.is_self ? 'self' : 'link',
        full: img.source.url, src: poster, thumb: smallImg,
        w: img.source.width, h: img.source.height,
        video: img.variants?.mp4?.source?.url || null,
      };
    }
    const th = thumbOf(s);
    if (th) return { kind: s.is_self ? 'self' : 'link', thumb: th, src: null };
    return null;
  }
  function normPost(d) {
    const x = d.crosspost_parent_list?.[0];
    const author = d.author === '[deleted]' ? '[gelöscht]' : d.author || '?';
    return {
      id: d.name,
      sub: d.subreddit || '',
      author,
      created: (d.created_utc || 0) * 1000,
      title: d.title || '',
      flair: d.link_flair_text || '',
      flairBg: d.link_flair_background_color || '',
      flairFg: d.link_flair_text_color || '',
      score: d.score || 0,
      ratio: typeof d.upvote_ratio === 'number' ? d.upvote_ratio : null,
      comments: d.num_comments || 0,
      permalink: WEB + (d.permalink || ''),
      url: absUrl(d.url_overridden_by_dest || d.url) || WEB + (d.permalink || ''),
      domain: d.domain || '',
      isSelf: !!d.is_self,
      nsfw: !!d.over_18,
      spoiler: !!d.spoiler,
      stickied: !!(d.stickied || d.pinned),
      locked: !!d.locked,
      selftext: d.selftext || '',
      selftextHtml: d.selftext_html || '',
      xpost: x ? `r/${x.subreddit}` : '',
      xpostHtml: x?.selftext_html || '',
      media: extractMedia(d),
      isNew: false,
    };
  }

  // ---------------------------------------------------------------- Spalten-Laufzeit
  const RT = new Map();
  function rt(id) {
    let r = RT.get(id);
    if (!r) {
      r = { posts: [], known: new Set(), after: null, loading: null, error: null, pending: null, pendingCount: 0, newCount: 0, lastFetch: 0, nextAt: 0, gen: 0, io: null };
      RT.set(id, r);
    }
    return r;
  }
  const colById = (id) => state.columns.find((c) => c.id === id);
  const colEl = (id) => document.querySelector(`.col[data-col="${CSS.escape(id)}"]`);
  const listEl = (id) => colEl(id)?.querySelector('.col-list');

  function colTitle(c) {
    if (c.name) return { pre: '', main: c.name };
    switch (c.type) {
      case 'sub': return { pre: 'r/', main: c.target };
      case 'user': return { pre: 'u/', main: c.target };
      case 'search': return { pre: '', main: `„${c.target}“` };
      default: return { pre: '', main: 'Startseite' };
    }
  }
  const titleText = (c) => { const t = colTitle(c); return t.pre + t.main; };
  function colSubtitle(c) {
    const parts = [];
    if (c.type === 'search') parts.push(c.sub ? `in r/${c.sub}` : 'ganz Reddit');
    parts.push(SORT_LABEL[c.sort]);
    if (usesT(c)) parts.push(T_LABEL[c.t]);
    return parts.join(' · ');
  }
  function railLabel(c) {
    if (c.name) return { kind: c.type === 'sub' ? 'r/' : c.type === 'user' ? 'u/' : c.type === 'search' ? 'q=' : '/', ab: c.name.slice(0, 3) };
    switch (c.type) {
      case 'sub': return { kind: 'r/', ab: c.target.split('+')[0].slice(0, 3) };
      case 'user': return { kind: 'u/', ab: c.target.slice(0, 3) };
      case 'search': return { kind: 'q=', ab: c.target.replace(/\s+/g, '').slice(0, 3) };
      default: return { kind: '/', ab: 'home' };
    }
  }
  const isSingleSub = (c) => c.type === 'sub' && !c.target.includes('+') && !['all', 'popular'].includes(c.target.toLowerCase());

  function visiblePosts(posts) {
    const s = state.settings;
    const mutes = s.mute.map((m) => m.trim().toLowerCase()).filter(Boolean);
    return posts.filter((p) => {
      if (s.hideNsfw && p.nsfw) return false;
      if (s.hidePinned && p.stickied) return false;
      for (const m of mutes) {
        if (m.startsWith('r/')) { if (p.sub.toLowerCase() === m.slice(2)) return false; }
        else if (m.startsWith('u/')) { if (p.author.toLowerCase() === m.slice(2)) return false; }
        else if (p.title.toLowerCase().includes(m) || p.flair.toLowerCase().includes(m)) return false;
      }
      return true;
    });
  }

  async function loadColumn(c, mode = 'reset', { manual = false } = {}) {
    const r = rt(c.id);
    if (mode === 'refresh' && !r.posts.length) mode = 'reset';
    if (mode !== 'reset' && r.loading) return;
    if (mode === 'more' && (!r.after || r.posts.length >= MAX_POSTS)) return;
    const gen = ++r.gen;
    r.loading = mode;
    if (mode === 'reset') {
      Object.assign(r, { posts: [], known: new Set(), after: null, pending: null, pendingCount: 0, newCount: 0, error: null });
      renderList(c, { keepScroll: false });
    } else if (mode === 'more') {
      const more = $('.col-more', listEl(c.id) || document.createElement('div'));
      if (more) more.textContent = 'Lädt …';
    }
    renderHead(c);
    try {
      const { path, params } = listingRequest(c, mode === 'more' ? r.after : null);
      // Vorrang nur für Dinge, auf die gerade jemand wartet. Der Start lädt der Reihe nach von links.
      const body = await rget(path, params, { priority: manual || mode === 'more' });
      if (r.gen !== gen || !colById(c.id)) return;
      const { posts, after } = parseListing(body);
      if (mode === 'reset') {
        r.posts = posts;
        r.after = after;
        posts.forEach((p) => r.known.add(p.id));
      } else if (mode === 'more') {
        const have = new Set(r.posts.map((p) => p.id));
        const add = posts.filter((p) => !have.has(p.id));
        r.posts.push(...add);
        add.forEach((p) => r.known.add(p.id));
        r.after = add.length ? after : null;
        if (r.pending) {
          const ph = new Set(r.pending.map((p) => p.id));
          r.pending.push(...add.filter((p) => !ph.has(p.id)));
        }
      } else {
        const base = r.pending || r.posts;
        const stillNew = new Set(base.filter((p) => p.isNew).map((p) => p.id));
        const fresh = posts.filter((p) => !r.known.has(p.id));
        fresh.forEach((p) => { p.isNew = true; r.known.add(p.id); });
        posts.forEach((p) => { if (stillNew.has(p.id)) p.isNew = true; });
        const got = new Set(posts.map((p) => p.id));
        const merged = posts.concat(base.filter((p) => !got.has(p.id))).slice(0, MAX_POSTS);
        const freshVisible = visiblePosts(fresh).length;
        r.newCount += freshVisible;
        const list = listEl(c.id);
        const scrolled = !!list && list.scrollTop > 8;
        // Wer gerade weiter unten liest, bekommt keine springende Liste, sondern einen Hinweis oben.
        if (scrolled && !manual) {
          r.pending = merged;
          r.pendingCount += freshVisible;
        } else {
          r.posts = merged;
          r.pending = null;
          r.pendingCount = 0;
          if (manual && list) list.scrollTop = 0;
        }
      }
      r.error = null;
      r.lastFetch = Date.now();
    } catch (e) {
      if (r.gen !== gen) return;
      r.error = e instanceof ApiError ? e : new ApiError('http', `Unerwarteter Fehler: ${e.message}`);
      if (r.error.kind === 'network' && !IS_EXT) showBanner('page');
    } finally {
      if (r.gen === gen) {
        r.loading = null;
        r.nextAt = c.refresh ? Date.now() + c.refresh * 60000 + Math.random() * 8000 : Infinity;
        if (r.error?.kind === 'rate') r.nextAt = Math.max(r.nextAt, net.pauseUntil + 2000);
        if (colById(c.id)) { renderList(c); renderHead(c); updateBadges(); }
      }
    }
  }

  function applyPending(c) {
    const r = rt(c.id);
    if (!r.pending) return;
    r.posts = r.pending;
    r.pending = null;
    r.pendingCount = 0;
    renderList(c, { keepScroll: false });
    const list = listEl(c.id);
    if (list) list.scrollTop = 0;
    renderHead(c);
    clearNew(c);
  }
  function clearNew(c) {
    const r = rt(c.id);
    if (!r.newCount || r.pending) return;
    r.newCount = 0;
    renderHead(c);
    updateBadges();
    const ids = new Set(r.posts.filter((p) => p.isNew).map((p) => p.id));
    setTimeout(() => {
      r.posts.forEach((p) => { if (ids.has(p.id)) p.isNew = false; });
      const list = listEl(c.id);
      if (list) $$('.post.is-new', list).forEach((el) => { if (ids.has(el.dataset.id)) el.classList.remove('is-new'); });
    }, 3500);
  }

  // ---------------------------------------------------------------- Rendering
  const deck = $('#deck');
  const railCols = $('#rail-cols');

  function addTile() {
    const b = document.createElement('button');
    b.className = 'col-add';
    b.dataset.act = 'add-col';
    b.innerHTML = `${icon('plus')}<strong>Spalte hinzufügen</strong><span>Subreddit, Suche, Nutzer oder deine Startseite</span>`;
    return b;
  }
  function buildColumn(c) {
    const el = document.createElement('section');
    el.className = 'col';
    el.dataset.col = c.id;
    el.innerHTML = `
      <header class="col-head" draggable="true" title="Zum Verschieben ziehen">
        <div class="col-heading"><h2 class="col-title"><span class="col-pre"></span><span class="col-name"></span></h2><span class="col-badge" hidden></span></div>
        <div class="col-meta"><span class="col-sort"></span><span class="col-status"></span></div>
        <div class="col-actions">
          <button class="icon-btn" data-act="refresh" title="Aktualisieren" aria-label="Spalte aktualisieren">${icon('refresh')}</button>
          <button class="icon-btn" data-act="config" title="Spalte einstellen" aria-label="Spalte einstellen" aria-expanded="false">${icon('sliders')}</button>
        </div>
      </header>
      <div class="col-config" hidden></div>
      <div class="col-body">
        <button class="col-pill" data-act="apply" hidden></button>
        <div class="col-list" tabindex="-1" role="feed" aria-busy="false"></div>
      </div>`;
    return el;
  }
  function buildDeck() {
    deck.innerHTML = '';
    for (const c of state.columns) deck.appendChild(buildColumn(c));
    deck.appendChild(addTile());
    state.columns.forEach((c) => { renderHead(c); renderList(c); });
  }

  function statusText(c, r) {
    if (r.loading && r.loading !== 'more') return 'lädt …';
    if (r.error) return 'Fehler';
    if (r.lastFetch) return rel(r.lastFetch);
    return '';
  }
  function renderHead(c) {
    const el = colEl(c.id);
    if (!el) return;
    const r = rt(c.id);
    const t = colTitle(c);
    el.dataset.width = c.width;
    el.setAttribute('aria-label', t.pre + t.main);
    $('.col-pre', el).textContent = t.pre;
    $('.col-name', el).textContent = t.main;
    $('.col-title', el).title = t.pre + t.main;
    $('.col-sort', el).textContent = colSubtitle(c);
    const status = $('.col-status', el);
    status.textContent = statusText(c, r);
    status.title = c.refresh ? `Aktualisiert sich alle ${c.refresh} Min.` : 'Automatische Aktualisierung aus';
    el.classList.toggle('is-loading', !!r.loading);
    el.classList.toggle('has-error', !!r.error);
    $('.col-list', el).setAttribute('aria-busy', String(!!r.loading));
    const badge = $('.col-badge', el);
    badge.hidden = !r.newCount;
    badge.textContent = r.newCount > 99 ? '99+' : String(r.newCount);
    badge.title = `${r.newCount} neu seit dem letzten Blick`;
    const pill = $('.col-pill', el);
    pill.hidden = !r.pending || !r.pendingCount;
    if (r.pending) pill.innerHTML = `${icon('arrow-up')} ${r.pendingCount} ${r.pendingCount === 1 ? 'neuer Beitrag' : 'neue Beiträge'}`;
  }

  function flairHTML(p) {
    if (!p.flair) return '';
    const bg = /^#[0-9a-f]{3,8}$/i.test(p.flairBg) ? p.flairBg : '';
    const style = bg ? ` style="--fl-bg:${bg};--fl-fg:${p.flairFg === 'light' ? '#ffffff' : '#111111'}"` : '';
    return `<span class="flair${bg ? ' has-color' : ''}"${style}>${esc(p.flair)}</span>`;
  }
  function tagsHTML(p) {
    return [
      p.stickied ? '<span class="tag tag-pin">Angepinnt</span>' : '',
      p.nsfw ? '<span class="tag tag-nsfw">NSFW</span>' : '',
      p.spoiler ? '<span class="tag tag-spoiler">Spoiler</span>' : '',
      flairHTML(p),
    ].join('');
  }
  function postHTML(p, c) {
    const s = state.settings;
    const cls = ['post'];
    if (p.isNew) cls.push('is-new');
    if (readSet.has(p.id)) cls.push('is-read');
    if (drawer.postId === p.id) cls.push('is-active');
    const m = p.media;
    const blur = p.nsfw || p.spoiler;
    let side = '';
    let big = '';
    if (m && s.media !== 'off') {
      const badge = m.kind === 'video' ? `<span class="media-badge">${icon('play')}</span>`
        : m.kind === 'gallery' ? `<span class="media-badge">${m.items.length}</span>` : '';
      if (s.media === 'large' && m.src && (m.kind === 'image' || m.kind === 'gallery' || m.kind === 'video')) {
        const ratio = m.w && m.h ? `${m.w} / ${m.h}` : '16 / 9';
        big = `<div class="post-media${blur ? ' is-blurred' : ''}" style="aspect-ratio:${ratio}"><img src="${esc(m.src)}" alt="" loading="lazy" decoding="async">${badge}</div>`;
      } else if (m.thumb) {
        side = `<div class="post-thumb${blur ? ' is-blurred' : ''}"><img src="${esc(m.thumb)}" alt="" loading="lazy" decoding="async">${badge}</div>`;
      }
    }
    const tags = tagsHTML(p);
    const excerpt = p.isSelf && p.selftext && s.density !== 'compact' ? `<p class="post-excerpt">${esc(plain(p.selftext, 240))}</p>` : '';
    const showSub = !isSingleSub(c) || c.target.toLowerCase() !== p.sub.toLowerCase();
    return `<article class="${cls.join(' ')}" data-id="${esc(p.id)}" tabindex="0">
      <div class="post-meta">${showSub ? `<span class="m-sub">r/${esc(p.sub)}</span>` : ''}<span class="m-author">u/${esc(p.author)}</span><time data-ts="${p.created}" title="${esc(fullDate(p.created))}">${rel(p.created)}</time>${p.xpost ? `<span class="m-x">Crosspost aus ${esc(p.xpost)}</span>` : ''}</div>
      <div class="post-main"><div class="post-text"><h3 class="post-title"><a href="${esc(p.permalink)}" target="_blank" rel="noopener" tabindex="-1">${esc(p.title)}</a></h3>${tags ? `<div class="post-tags">${tags}</div>` : ''}${excerpt}</div>${side}</div>
      ${big}
      <div class="post-foot"><span class="f-score" title="${p.score.toLocaleString('de-DE')} Punkte">${icon('up')}${num(p.score)}</span><span class="f-com" title="${p.comments.toLocaleString('de-DE')} Kommentare">${icon('comment')}${num(p.comments)}</span>${p.locked ? `<span class="f-lock" title="Kommentare gesperrt">${icon('lock')}</span>` : ''}<span class="f-domain">${p.isSelf ? 'Textbeitrag' : esc(p.domain)}</span></div>
    </article>`;
  }
  const skeletons = (n = 5) => Array.from({ length: n }, () => '<div class="skel" aria-hidden="true"><i></i><i></i><i></i></div>').join('');

  function errorTitle(e) {
    return { notfound: 'Nicht gefunden', private: 'Kein Zugriff', rate: 'Kurz pausiert', blocked: 'Anmeldung nötig', network: 'Keine Verbindung', perm: 'Zugriff fehlt' }[e.kind] || 'Laden fehlgeschlagen';
  }
  function renderList(c, { keepScroll = true } = {}) {
    const list = listEl(c.id);
    if (!list) return;
    const r = rt(c.id);
    const focusedId = document.activeElement?.closest?.('.post')?.dataset.id;
    const top = list.scrollTop;
    let html = '';
    if (!r.posts.length) {
      if (r.error) {
        const login = r.error.kind === 'blocked' ? `<a class="btn btn-primary" href="${LOGIN_URL}" target="_blank" rel="noopener">Bei Reddit anmelden</a>` : '';
        const retry = r.error.kind === 'perm' ? '' : '<button class="btn" data-act="retry">Erneut versuchen</button>';
        html = `<div class="col-state is-error"><strong>${esc(errorTitle(r.error))}</strong><p>${esc(r.error.message)}</p><div class="btn-row">${login}${retry}</div></div>`;
      } else if (r.loading) {
        html = skeletons();
      } else if (r.lastFetch) {
        html = '<div class="col-state"><strong>Keine Beiträge</strong><p>Hier ist gerade nichts zu sehen. Probier eine andere Sortierung oder einen längeren Zeitraum.</p></div>';
      }
    } else {
      const vis = visiblePosts(r.posts);
      if (r.error) html += `<p class="col-note is-error">${esc(r.error.message)}</p>`;
      html += vis.map((p) => postHTML(p, c)).join('');
      const hidden = r.posts.length - vis.length;
      if (!vis.length) html += `<div class="col-state"><strong>Alles ausgeblendet</strong><p>${hidden} ${hidden === 1 ? 'Beitrag passt' : 'Beiträge passen'} nicht zu deinen Filtern (NSFW, Angepinnt oder Stummgeschaltet).</p></div>`;
      if (r.after && r.posts.length < MAX_POSTS) html += `<div class="col-more">${r.loading === 'more' ? 'Lädt …' : ''}</div>`;
      else html += `<p class="col-end">${hidden && vis.length ? `${hidden} ausgeblendet · ` : ''}Ende der Liste</p>`;
    }
    list.innerHTML = html;
    if (keepScroll) list.scrollTop = top;
    observeMore(c, list, r.posts.length > 0 && visiblePosts(r.posts).length > 0);
    if (focusedId) $(`.post[data-id="${CSS.escape(focusedId)}"]`, list)?.focus({ preventScroll: true });
  }
  function observeMore(c, list, enabled) {
    const r = rt(c.id);
    if (!enabled) { r.io?.disconnect(); return; }
    if (!r.io) {
      r.io = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          const col = colById(c.id);
          if (col) loadColumn(col, 'more');
        }
      }, { root: list, rootMargin: '0px 0px 600px 0px' });
    }
    r.io.disconnect();
    const sentinel = $('.col-more', list);
    if (sentinel) r.io.observe(sentinel);
  }
  const rerenderAll = () => state.columns.forEach((c) => renderList(c));

  function renderRail() {
    railCols.innerHTML = state.columns.map((c, i) => {
      const l = railLabel(c);
      const label = titleText(c);
      return `<button class="rail-col" data-jump="${esc(c.id)}" title="${esc(label)}${i < 9 ? ` (${i + 1})` : ''}" aria-label="Zu ${esc(label)} springen"><span class="rail-kind">${esc(l.kind)}</span><span class="rail-ab">${esc(l.ab)}</span><span class="rail-dot" hidden></span></button>`;
    }).join('');
    updateBadges();
  }
  function updateBadges() {
    let total = 0;
    for (const c of state.columns) {
      const n = rt(c.id).newCount;
      total += n;
      const dot = $(`.rail-col[data-jump="${CSS.escape(c.id)}"] .rail-dot`);
      if (dot) { dot.hidden = !n; dot.textContent = n > 9 ? '9+' : String(n); }
    }
    document.title = total ? `(${total}) Subdeck` : 'Subdeck';
  }
  function renderRate() {
    const el = $('#rail-rate');
    if (net.remaining == null) return;
    const n = Math.floor(net.remaining);
    el.hidden = false;
    el.textContent = String(n);
    el.title = `Noch ${n} Reddit-Anfragen frei, neues Kontingent um ${clock(net.resetAt)}`;
    el.classList.toggle('is-low', n < 15);
  }
  function updateTimes() {
    $$('time[data-ts]').forEach((t) => { t.textContent = rel(+t.dataset.ts); });
    state.columns.forEach((c) => {
      const el = colEl(c.id);
      if (el) $('.col-status', el).textContent = statusText(c, rt(c.id));
    });
  }

  // ---------------------------------------------------------------- Spalten verwalten
  function configHTML(c) {
    const opt = (list, cur, label) => list.map((v) => `<option value="${v}"${String(v) === String(cur) ? ' selected' : ''}>${esc(label(v))}</option>`).join('');
    return `
      <div class="cfg-grid">
        <label class="fld"><span class="fld-label">Sortierung</span><select data-cfg="sort">${opt(TYPES[c.type].sorts, c.sort, (v) => SORT_LABEL[v])}</select></label>
        <label class="fld" data-twrap${usesT(c) ? '' : ' hidden'}><span class="fld-label">Zeitraum</span><select data-cfg="t">${opt(Object.keys(T_LABEL), c.t, (v) => T_LABEL[v])}</select></label>
        <label class="fld"><span class="fld-label">Aktualisierung</span><select data-cfg="refresh">${opt(REFRESH, c.refresh, (v) => (v ? `alle ${v} Min.` : 'nur von Hand'))}</select></label>
        <label class="fld"><span class="fld-label">Eigener Name</span><input data-cfg="name" value="${esc(c.name)}" placeholder="${esc(colTitle({ ...c, name: '' }).pre + colTitle({ ...c, name: '' }).main)}" maxlength="40"></label>
      </div>
      <div class="fld"><span class="fld-label">Breite</span><div class="seg" role="group" aria-label="Breite">${Object.keys(WIDTH_LABEL).map((w) => `<button type="button" data-width="${w}" aria-pressed="${c.width === w}">${WIDTH_LABEL[w]}</button>`).join('')}</div></div>
      <div class="cfg-actions">
        <button type="button" class="btn btn-ghost" data-act="left">← Nach links</button>
        <button type="button" class="btn btn-ghost" data-act="right">Nach rechts →</button>
        <button type="button" class="btn btn-danger" data-act="remove">Entfernen</button>
      </div>`;
  }
  function toggleConfig(c, force) {
    const el = colEl(c.id);
    const box = $('.col-config', el);
    const open = force ?? box.hidden;
    if (open) box.innerHTML = configHTML(c);
    box.hidden = !open;
    $('[data-act="config"]', el).setAttribute('aria-expanded', String(open));
  }
  function reorderDom() {
    const tops = new Map(state.columns.map((c) => [c.id, listEl(c.id)?.scrollTop || 0]));
    const tile = $('.col-add', deck);
    for (const c of state.columns) { const el = colEl(c.id); if (el) deck.insertBefore(el, tile); }
    for (const [id, top] of tops) { const l = listEl(id); if (l) l.scrollTop = top; }
  }
  function moveColumn(c, dir) {
    const i = state.columns.indexOf(c);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= state.columns.length) return;
    state.columns.splice(i, 1);
    state.columns.splice(j, 0, c);
    save();
    reorderDom();
    renderRail();
    colEl(c.id)?.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
  }
  function removeColumn(c) {
    const i = state.columns.indexOf(c);
    if (i < 0) return;
    state.columns.splice(i, 1);
    const r = RT.get(c.id);
    r?.io?.disconnect();
    if (r) r.gen++;
    RT.delete(c.id);
    colEl(c.id)?.remove();
    if (drawer.colId === c.id) closeDrawer();
    save();
    renderRail();
    toast(`${titleText(c)} entfernt`);
  }
  function addColumn(col) {
    state.columns.push(col);
    save();
    deck.insertBefore(buildColumn(col), $('.col-add', deck));
    renderHead(col);
    renderRail();
    loadColumn(col, 'reset', { manual: true });
    colEl(col.id)?.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
    toast(`${titleText(col)} hinzugefügt`);
  }
  function refreshAll() {
    state.columns.forEach((c) => loadColumn(c, 'refresh', { manual: true }));
  }
  function jumpTo(id) {
    const el = colEl(id);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
    const first = $('.post', el);
    (first || $('.col-list', el)).focus({ preventScroll: true });
    const c = colById(id);
    if (c) clearNew(c);
  }

  // ---------------------------------------------------------------- Detailleiste
  const drawerEl = $('#drawer');
  const dBody = $('#d-body');
  const drawer = { colId: null, postId: null, post: null, commentSort: 'confidence', req: 0, returnFocus: null };
  const isDrawerOpen = () => drawerEl.classList.contains('is-open');

  function findPost(colId, postId) {
    const r = RT.get(colId);
    return r ? r.posts.find((p) => p.id === postId) || r.pending?.find((p) => p.id === postId) || null : null;
  }
  function openDrawer(colId, postId) {
    const c = colById(colId);
    const p = findPost(colId, postId);
    if (!c || !p) return;
    if (!isDrawerOpen()) drawer.returnFocus = document.activeElement;
    drawer.colId = colId;
    drawer.postId = postId;
    drawer.post = p;
    markRead(p.id);
    $$('.post.is-active').forEach((el) => el.classList.remove('is-active'));
    const card = $(`.post[data-id="${CSS.escape(postId)}"]`, colEl(colId));
    card?.classList.add('is-active');
    card?.scrollIntoView({ block: 'nearest' });
    renderDrawer(p, c);
    drawerEl.inert = false;
    drawerEl.classList.add('is-open');
    dBody.focus({ preventScroll: true });
    loadComments(p);
  }
  function closeDrawer() {
    if (!isDrawerOpen()) return;
    drawerEl.classList.remove('is-open');
    drawerEl.inert = true;
    $$('.post.is-active').forEach((el) => el.classList.remove('is-active'));
    const back = drawer.postId && drawer.colId ? $(`.post[data-id="${CSS.escape(drawer.postId)}"]`, colEl(drawer.colId) || document) : null;
    drawer.colId = drawer.postId = drawer.post = null;
    drawer.req++;
    $$('video', dBody).forEach((v) => v.pause());
    (back || drawer.returnFocus)?.focus?.({ preventScroll: true });
  }
  function drawerStep(dir) {
    const r = RT.get(drawer.colId);
    if (!r) return;
    const vis = visiblePosts(r.posts);
    const i = vis.findIndex((p) => p.id === drawer.postId);
    const next = vis[i + dir];
    if (next) openDrawer(drawer.colId, next.id);
    else if (dir > 0 && r.after) { toast('Lade weitere Beiträge …'); const c = colById(drawer.colId); if (c) loadColumn(c, 'more'); }
  }
  function mediaFull(p) {
    const m = p.media;
    const blur = p.nsfw || p.spoiler;
    const wrap = (inner) => `<div class="d-media${blur ? ' is-blurred' : ''}">${inner}${blur ? `<button type="button" class="reveal" data-dact="reveal">${p.nsfw ? 'NSFW' : 'Spoiler'} anzeigen</button>` : ''}</div>`;
    if (m?.kind === 'gallery') {
      return wrap(`<div class="gallery">${m.items.map((it, i) => `<figure><a href="${esc(it.full)}" target="_blank" rel="noopener"><img src="${esc(it.src)}" alt="${esc(it.caption || `Bild ${i + 1}`)}" loading="lazy"></a><figcaption>Bild ${i + 1} von ${m.items.length}${it.caption ? ` · ${esc(it.caption)}` : ''}</figcaption></figure>`).join('')}</div>`);
    }
    if (m?.kind === 'video') {
      return wrap(`<video src="${esc(m.video)}"${m.src ? ` poster="${esc(m.src)}"` : ''} controls playsinline preload="metadata"${m.gif ? ' loop muted autoplay' : ''}></video>${m.gif ? '' : '<p class="d-note">Vorschau ohne Ton. Mit Ton auf Reddit ansehen.</p>'}`);
    }
    if (m?.kind === 'image') {
      return wrap(m.video
        ? `<video src="${esc(m.video)}" loop muted autoplay playsinline></video>`
        : `<a href="${esc(m.full || m.src)}" target="_blank" rel="noopener"><img src="${esc(m.src || m.full)}" alt=""></a>`);
    }
    if (!p.isSelf) {
      const img = m?.src || m?.thumb;
      return `<a class="linkcard" href="${esc(p.url)}" target="_blank" rel="noopener">${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : ''}<span class="lc-domain">${esc(p.domain || 'Link')}</span><span class="lc-url">${esc(shortUrl(p.url))}</span></a>`;
    }
    return '';
  }
  function renderDrawer(p, c) {
    const r = RT.get(c.id);
    const vis = r ? visiblePosts(r.posts) : [];
    const pos = vis.findIndex((x) => x.id === p.id);
    $('#d-ctx').textContent = `${titleText(c)}${pos >= 0 ? ` · ${pos + 1} von ${vis.length}` : ''}`;
    const tags = [tagsHTML(p), p.locked ? '<span class="tag tag-lock">Gesperrt</span>' : ''].join('');
    const canUser = !/^\[/.test(p.author) && p.author !== '?';
    dBody.innerHTML = `
      <article class="d-post">
        <div class="d-meta"><a class="m-sub" href="${WEB}/r/${esc(p.sub)}/" target="_blank" rel="noopener">r/${esc(p.sub)}</a><span>u/${esc(p.author)}</span><time data-ts="${p.created}" title="${esc(fullDate(p.created))}">${rel(p.created)}</time>${p.xpost ? `<span class="m-x">Crosspost aus ${esc(p.xpost)}</span>` : ''}</div>
        <h1 class="d-title">${esc(p.title)}</h1>
        ${tags ? `<div class="post-tags">${tags}</div>` : ''}
        ${mediaFull(p)}
        <div class="d-text md" id="d-text">${sanitize(p.selftextHtml || p.xpostHtml)}</div>
        <div class="d-stats">
          <span class="f-score">${icon('up')}${p.score.toLocaleString('de-DE')} ${p.score === 1 ? 'Punkt' : 'Punkte'}</span>
          ${p.ratio != null ? `<span>${Math.round(p.ratio * 100)} % Upvotes</span>` : ''}
          <span>${icon('comment')}${p.comments.toLocaleString('de-DE')} Kommentare</span>
        </div>
        <div class="d-actions">
          <a class="btn btn-primary" href="${esc(p.permalink)}" target="_blank" rel="noopener">${icon('ext')}Auf Reddit öffnen</a>
          ${!p.isSelf ? `<a class="btn" href="${esc(p.url)}" target="_blank" rel="noopener">Link öffnen</a>` : ''}
          <button type="button" class="btn" data-dact="copy">Link kopieren</button>
          ${isSingleSub(c) && c.target.toLowerCase() === p.sub.toLowerCase() ? '' : `<button type="button" class="btn" data-dact="add-sub">r/${esc(p.sub)} als Spalte</button>`}
          ${canUser ? `<button type="button" class="btn" data-dact="add-user">u/${esc(p.author)} als Spalte</button>` : ''}
        </div>
      </article>
      <section class="d-comments" aria-label="Kommentare">
        <div class="dc-head"><h2>Kommentare</h2>
          <label><span class="sr-only">Kommentare sortieren</span><select id="dc-sort">${Object.entries(COMMENT_SORTS).map(([k, v]) => `<option value="${k}"${k === drawer.commentSort ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
        </div>
        <div class="dc-list" id="dc-list"></div>
      </section>`;
    dBody.scrollTop = 0;
  }
  async function loadComments(p) {
    const req = ++drawer.req;
    const box = $('#dc-list');
    if (!box) return;
    box.setAttribute('aria-busy', 'true');
    box.innerHTML = skeletons(3);
    try {
      const body = await rget(`/comments/${p.id.replace(/^t3_/, '')}.json`, { limit: 80, depth: 5, sort: drawer.commentSort }, { priority: true });
      if (req !== drawer.req) return;
      const full = body?.[0]?.data?.children?.[0]?.data;
      const textBox = $('#d-text');
      if (full?.selftext_html && textBox && !textBox.innerHTML.trim()) textBox.innerHTML = sanitize(full.selftext_html);
      const kids = body?.[1]?.data?.children || [];
      const html = kids.map((k) => commentHTML(k, 0, p)).join('');
      box.innerHTML = html || '<p class="muted">Noch keine Kommentare.</p>';
    } catch (e) {
      if (req !== drawer.req) return;
      box.innerHTML = `<div class="col-state is-error"><strong>${esc(errorTitle(e))}</strong><p>${esc(e.message)}</p><button type="button" class="btn" data-dact="retry-comments">Erneut versuchen</button></div>`;
    } finally {
      if (req === drawer.req) box.setAttribute('aria-busy', 'false');
    }
  }
  function commentHTML(k, depth, p) {
    if (k.kind === 'more') {
      const n = k.data?.count || 0;
      if (!n) return '';
      const parent = String(k.data.parent_id || '');
      const href = parent.startsWith('t1_') ? `${p.permalink}${parent.slice(3)}/` : p.permalink;
      return `<a class="c-more" href="${esc(href)}" target="_blank" rel="noopener">${n} weitere ${n === 1 ? 'Antwort' : 'Antworten'} auf Reddit</a>`;
    }
    if (k.kind !== 't1' || !k.data) return '';
    const d = k.data;
    const kids = d.replies?.data?.children || [];
    const ts = (d.created_utc || 0) * 1000;
    const score = d.score_hidden ? 'Punkte verborgen' : `${num(d.score)} ${d.score === 1 ? 'Punkt' : 'Punkte'}`;
    const author = d.author === '[deleted]' ? '[gelöscht]' : d.author;
    return `<div class="c" data-depth="${depth}">
      <div class="c-head"><button type="button" class="c-toggle" aria-expanded="true" aria-label="Kommentar einklappen" title="Einklappen"></button><span class="c-author${d.is_submitter ? ' is-op' : ''}">${esc(author)}</span>${d.is_submitter ? '<span class="c-op">OP</span>' : ''}${d.distinguished === 'moderator' ? '<span class="c-mod">MOD</span>' : ''}${d.stickied ? '<span class="tag tag-pin">Angepinnt</span>' : ''}<span>${score}</span><time data-ts="${ts}" title="${esc(fullDate(ts))}">${rel(ts)}</time>${d.edited ? '<span>bearbeitet</span>' : ''}</div>
      <div class="c-body md">${sanitize(d.body_html)}</div>
      ${kids.length ? `<div class="c-replies">${kids.map((x) => commentHTML(x, depth + 1, p)).join('')}</div>` : ''}
    </div>`;
  }

  // ---------------------------------------------------------------- Hinweise
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    requestAnimationFrame(() => t.classList.add('show'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      t.classList.remove('show');
      setTimeout(() => { if (!t.classList.contains('show')) t.hidden = true; }, 250);
    }, 2600);
  }
  function showBanner(kind) {
    const b = $('#banner');
    if (kind === 'perm') {
      b.innerHTML = '<p><strong>Noch ein Schritt:</strong> Subdeck braucht deine Erlaubnis, Beiträge von reddit.com zu laden.</p><button type="button" class="btn btn-primary" data-banner="grant">Zugriff erlauben</button>';
    } else if (kind === 'page') {
      if (b.dataset.kind === 'page' && b.dataset.dismissed) return;
      b.innerHTML = '<p><strong>Reddit lässt sich aus einem normalen Tab nicht laden.</strong> Installiere Subdeck als Browser-Erweiterung, dann klappt es. Die Anleitung steht in der README.md im Subdeck-Ordner.</p><button type="button" class="icon-btn" data-banner="dismiss" aria-label="Hinweis schließen">' + icon('x') + '</button>';
    }
    b.dataset.kind = kind;
    b.hidden = false;
  }
  const hideBanner = () => { $('#banner').hidden = true; };

  // ---------------------------------------------------------------- Dialog: Spalte hinzufügen
  const dlgAdd = $('#dlg-add');
  const add = { type: 'sub', acTimer: 0, acCache: new Map(), acSeq: 0 };
  function fillSelect(sel, entries, value) {
    sel.innerHTML = entries.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('');
    sel.value = String(value);
  }
  function syncAddForm(pre = {}) {
    const T = TYPES[add.type];
    $$('#add-type button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.type === add.type)));
    $('#add-target-wrap').hidden = add.type === 'home';
    $('#add-target-label').textContent = T.field;
    const prefix = $('#add-prefix');
    prefix.textContent = add.type === 'sub' ? 'r/' : add.type === 'user' ? 'u/' : '';
    prefix.hidden = add.type === 'search';
    $('#add-target').placeholder = T.ph;
    $('#add-sub-wrap').hidden = add.type !== 'search';
    $('#add-home-hint').hidden = add.type !== 'home';
    fillSelect($('#add-sort'), T.sorts.map((s) => [s, SORT_LABEL[s]]), pre.sort && T.sorts.includes(pre.sort) ? pre.sort : T.def);
    fillSelect($('#add-t'), Object.entries(T_LABEL), add.type === 'search' ? 'week' : 'day');
    fillSelect($('#add-refresh'), REFRESH.map((v) => [v, v ? `alle ${v} Min.` : 'nur von Hand']), add.type === 'search' ? 10 : add.type === 'sub' ? 5 : 15);
    syncAddT();
    renderChips();
  }
  function syncAddT() {
    $('#add-t-wrap').hidden = !usesT({ type: add.type, sort: $('#add-sort').value });
  }
  function renderChips(items) {
    const box = $('#add-chips');
    if (add.type !== 'sub') { box.innerHTML = ''; return; }
    const list = items || SUGGEST.map((name) => ({ name }));
    box.innerHTML = list.map((i) => `<button type="button" class="chip" data-chip="${esc(i.name)}">r/${esc(i.name)}${i.subs != null ? `<small>${num(i.subs)}</small>` : ''}</button>`).join('');
  }
  function openAdd(pre = {}) {
    if (dlgAdd.open) return;
    add.type = pre.type && TYPES[pre.type] ? pre.type : 'sub';
    $('#add-target').value = pre.target || '';
    $('#add-sub').value = '';
    $('#add-error').hidden = true;
    const btn = $('#add-submit');
    btn.disabled = false;
    btn.textContent = 'Hinzufügen';
    syncAddForm(pre);
    dlgAdd.showModal();
    (add.type === 'home' ? $('#add-sort') : $('#add-target')).focus();
  }
  function cleanSub(v) {
    v = String(v || '').trim();
    const m = v.match(/\/r\/([A-Za-z0-9_+]+)/i);
    if (m) v = m[1];
    return v.replace(/^\/?r\//i, '').replace(/[\s,]+/g, '+').replace(/[^A-Za-z0-9_+]/g, '').replace(/\++/g, '+').replace(/^\+|\+$/g, '').slice(0, 200);
  }
  function cleanUser(v) {
    v = String(v || '').trim();
    const m = v.match(/\/u(?:ser)?\/([A-Za-z0-9_-]+)/i);
    if (m) v = m[1];
    return v.replace(/^\/?u(ser)?\//i, '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
  }
  async function submitAdd(e) {
    e.preventDefault();
    const err = $('#add-error');
    const btn = $('#add-submit');
    if (btn.disabled) return;
    const fail = (msg) => { err.textContent = msg; err.hidden = false; btn.disabled = false; btn.textContent = 'Hinzufügen'; };
    err.hidden = true;
    const raw = $('#add-target').value.trim();
    let type = add.type;
    if (type === 'sub' && /\/u(ser)?\//i.test(raw)) type = 'user';
    if (type === 'user' && /\/r\//i.test(raw)) type = 'sub';
    const col = normCol({
      id: uid(), type, target: type === 'home' ? '' : 'x', sub: '',
      sort: $('#add-sort').value, t: $('#add-t').value, refresh: +$('#add-refresh').value, width: 'm', name: '',
    });
    if (type === 'sub') { col.target = cleanSub(raw); if (!col.target) return fail('Gib den Namen eines Subreddits ein, zum Beispiel de.'); }
    if (type === 'user') { col.target = cleanUser(raw); if (!col.target) return fail('Gib einen Nutzernamen ein.'); }
    if (type === 'search') { col.target = raw.slice(0, 120); if (!col.target) return fail('Gib einen Suchbegriff ein.'); col.sub = cleanSub($('#add-sub').value); }
    if (type === 'home') col.target = '';
    const check = (type === 'sub' && isSingleSub(col)) || type === 'user';
    if (check) {
      btn.disabled = true;
      btn.textContent = 'Prüfe …';
      try {
        const body = await rget(type === 'sub' ? `/r/${col.target}/about.json` : `/user/${col.target}/about.json`, {}, { priority: true });
        if (type === 'sub') {
          if (body?.kind !== 't5') throw new ApiError('notfound', '');
          col.target = body.data?.display_name || col.target;
          if (body.data?.over18 && state.settings.hideNsfw) toast('Hinweis: Das ist ein NSFW-Subreddit. Solche Beiträge blendest du gerade aus.');
        } else {
          if (body?.kind !== 't2') throw new ApiError('notfound', '');
          col.target = body.data?.name || col.target;
        }
      } catch (e2) {
        if (e2.kind === 'notfound') return fail(type === 'sub' ? `r/${col.target} gibt es nicht oder es wurde gesperrt.` : `u/${col.target} gibt es nicht oder das Konto ist gesperrt.`);
        if (e2.kind === 'private') return fail(e2.message);
        // Andere Fehler (Netz, Drosselung): trotzdem anlegen, die Spalte zeigt den Fehler selbst.
      }
      btn.disabled = false;
      btn.textContent = 'Hinzufügen';
    }
    dlgAdd.close();
    addColumn(col);
  }
  function autocomplete() {
    clearTimeout(add.acTimer);
    if (add.type !== 'sub') return;
    const q = cleanSub($('#add-target').value);
    if (q.length < 2 || q.includes('+')) { renderChips(); return; }
    add.acTimer = setTimeout(async () => {
      const seq = ++add.acSeq;
      let items = add.acCache.get(q.toLowerCase());
      if (!items) {
        try {
          const body = await rget('/subreddits/search.json', { q, limit: 8 }, { priority: true });
          items = (body?.data?.children || []).filter((k) => k.kind === 't5').map((k) => ({ name: k.data.display_name, subs: k.data.subscribers || 0, nsfw: !!k.data.over18 }));
          add.acCache.set(q.toLowerCase(), items);
        } catch { return; }
      }
      if (seq !== add.acSeq || !dlgAdd.open || add.type !== 'sub') return;
      const shown = state.settings.hideNsfw ? items.filter((i) => !i.nsfw) : items;
      renderChips(shown.length ? shown : undefined);
    }, 450);
  }

  // ---------------------------------------------------------------- Dialog: Einstellungen
  const dlgSet = $('#dlg-settings');
  function applySettings() {
    const s = state.settings;
    const root = document.documentElement;
    if (s.theme === 'system') delete root.dataset.theme; else root.dataset.theme = s.theme;
    root.dataset.density = s.density;
    root.classList.toggle('dim-read', !!s.dimRead);
  }
  function exportText() {
    return JSON.stringify({ app: 'subdeck', v: 1, columns: state.columns.map(({ id, ...rest }) => rest), settings: state.settings }, null, 2);
  }
  function syncSettingsForm() {
    const s = state.settings;
    $$('#dlg-settings .seg[data-setting]').forEach((seg) => $$('button', seg).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === s[seg.dataset.setting]))));
    $$('#dlg-settings [data-check]').forEach((i) => { i.checked = !!s[i.dataset.check]; });
    $('#io-clear-read').textContent = `Gelesen-Verlauf löschen (${readSet.size})`;
    $('#set-rate').textContent = net.remaining != null
      ? `Reddit-Kontingent: noch ${Math.floor(net.remaining)} Anfragen frei, neues Kontingent um ${clock(net.resetAt)}.`
      : 'Subdeck fragt höchstens etwa eine Seite pro Sekunde bei Reddit an und pausiert, wenn Reddit bremst.';
  }
  function openSettings(section) {
    syncSettingsForm();
    $('#set-mute').value = state.settings.mute.join('\n');
    $('#set-io').value = exportText();
    const reset = $('#io-reset');
    delete reset.dataset.armed;
    reset.textContent = 'Alles zurücksetzen';
    if (!dlgSet.open) dlgSet.showModal();
    if (section === 'keys') $('#set-keys').scrollIntoView({ block: 'start' });
  }
  function replaceAll(columns, settings) {
    for (const r of RT.values()) { r.io?.disconnect(); r.gen++; }
    RT.clear();
    closeDrawer();
    state.columns = columns;
    state.settings = normSettings(settings);
    save();
    applySettings();
    buildDeck();
    renderRail();
    state.columns.forEach((c) => loadColumn(c, 'reset'));
  }

  // ---------------------------------------------------------------- Ereignisse
  let dragId = null;
  function bindEvents() {
    $('#btn-add').addEventListener('click', () => openAdd());
    $('#btn-refresh').addEventListener('click', refreshAll);
    $('#btn-settings').addEventListener('click', () => openSettings());
    railCols.addEventListener('click', (e) => { const b = e.target.closest('[data-jump]'); if (b) jumpTo(b.dataset.jump); });

    $('#banner').addEventListener('click', async (e) => {
      const act = e.target.closest('[data-banner]')?.dataset.banner;
      if (act === 'dismiss') { $('#banner').dataset.dismissed = '1'; hideBanner(); }
      if (act === 'grant') {
        try {
          const ok = await extApi.permissions.request(HOST);
          if (ok) { hideBanner(); state.columns.forEach((c) => loadColumn(c, 'reset')); }
        } catch { toast('Die Erlaubnis konnte nicht angefragt werden.'); }
      }
    });

    // Spalten
    deck.addEventListener('click', (e) => {
      if (e.target.closest('[data-act="add-col"]')) { openAdd(); return; }
      const colNode = e.target.closest('.col');
      if (!colNode) return;
      const c = colById(colNode.dataset.col);
      if (!c) return;
      const actBtn = e.target.closest('[data-act]');
      if (actBtn) { e.preventDefault(); colAction(c, actBtn.dataset.act, actBtn); return; }
      const w = e.target.closest('button[data-width]');
      if (w) {
        c.width = w.dataset.width;
        save();
        renderHead(c);
        $$('button[data-width]', colNode).forEach((b) => b.setAttribute('aria-pressed', String(b === w)));
        return;
      }
      const post = e.target.closest('.post');
      if (!post) return;
      const link = e.target.closest('a');
      if (link && (e.ctrlKey || e.metaKey || e.shiftKey)) { markRead(post.dataset.id); return; }
      e.preventDefault();
      openDrawer(c.id, post.dataset.id);
    });
    deck.addEventListener('auxclick', (e) => {
      if (e.button !== 1) return;
      const post = e.target.closest('.post');
      if (post && e.target.closest('a')) markRead(post.dataset.id);
    });
    deck.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === 'o') && e.target.classList?.contains('post') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const c = colById(e.target.closest('.col').dataset.col);
        if (c) { e.preventDefault(); e.stopPropagation(); openDrawer(c.id, e.target.dataset.id); }
      }
    });
    deck.addEventListener('change', (e) => {
      const f = e.target.closest('[data-cfg]');
      if (!f) return;
      const colNode = f.closest('.col');
      const c = colById(colNode.dataset.col);
      if (!c) return;
      const k = f.dataset.cfg;
      if (k === 'sort' || k === 't') {
        c[k] = f.value;
        const tw = $('[data-twrap]', colNode);
        if (tw) tw.hidden = !usesT(c);
        save(); renderHead(c); loadColumn(c, 'reset', { manual: true });
      } else if (k === 'refresh') {
        c.refresh = +f.value;
        rt(c.id).nextAt = c.refresh ? Date.now() + c.refresh * 60000 : Infinity;
        save(); renderHead(c);
      }
    });
    deck.addEventListener('input', (e) => {
      const f = e.target.closest('[data-cfg="name"]');
      if (!f) return;
      const c = colById(f.closest('.col').dataset.col);
      if (!c) return;
      c.name = f.value.trim().slice(0, 40);
      save(); renderHead(c); renderRail();
    });
    deck.addEventListener('scroll', (e) => {
      const list = e.target;
      if (!list.classList?.contains('col-list')) return;
      const c = colById(list.closest('.col').dataset.col);
      if (!c) return;
      const r = rt(c.id);
      if (r.pending && list.scrollTop <= 4) applyPending(c);
      else if (r.newCount && !r.pending) clearNew(c);
    }, true);
    let hoverTimer = 0;
    let hoverCol = null;
    deck.addEventListener('pointermove', (e) => {
      const colNode = e.target.closest('.col');
      const id = colNode?.dataset.col || null;
      if (id === hoverCol) return;
      hoverCol = id;
      clearTimeout(hoverTimer);
      if (!id) return;
      hoverTimer = setTimeout(() => { const c = colById(id); if (c && hoverCol === id) clearNew(c); }, 1500);
    });
    deck.addEventListener('pointerleave', () => { hoverCol = null; clearTimeout(hoverTimer); });

    // Ziehen zum Umsortieren
    deck.addEventListener('dragstart', (e) => {
      const head = e.target.closest?.('.col-head');
      if (!head) return;
      dragId = head.closest('.col').dataset.col;
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', dragId); } catch { /* egal */ }
      head.closest('.col').classList.add('is-dragging');
    });
    deck.addEventListener('dragover', (e) => {
      if (!dragId) return;
      const colNode = e.target.closest('.col');
      $$('.drop-before, .drop-after', deck).forEach((n) => n.classList.remove('drop-before', 'drop-after'));
      if (!colNode || colNode.dataset.col === dragId) return;
      e.preventDefault();
      const r = colNode.getBoundingClientRect();
      colNode.classList.add(e.clientX > r.left + r.width / 2 ? 'drop-after' : 'drop-before');
    });
    deck.addEventListener('drop', (e) => {
      if (!dragId) return;
      e.preventDefault();
      const target = $('.drop-before, .drop-after', deck);
      const moving = colById(dragId);
      if (target && moving) {
        const after = target.classList.contains('drop-after');
        state.columns.splice(state.columns.indexOf(moving), 1);
        const idx = state.columns.findIndex((c) => c.id === target.dataset.col);
        state.columns.splice(idx + (after ? 1 : 0), 0, moving);
        save(); reorderDom(); renderRail();
      }
      endDrag();
    });
    deck.addEventListener('dragend', endDrag);

    // Detailleiste
    $('#d-close').addEventListener('click', closeDrawer);
    $('#d-prev').addEventListener('click', () => drawerStep(-1));
    $('#d-next').addEventListener('click', () => drawerStep(1));
    dBody.addEventListener('click', (e) => {
      const p = drawer.post;
      const t = e.target;
      const tog = t.closest('.c-toggle');
      if (tog) {
        const c = tog.closest('.c');
        const collapsed = c.classList.toggle('is-collapsed');
        tog.setAttribute('aria-expanded', String(!collapsed));
        tog.setAttribute('aria-label', collapsed ? 'Kommentar ausklappen' : 'Kommentar einklappen');
        tog.title = collapsed ? 'Ausklappen' : 'Einklappen';
        return;
      }
      const sp = t.closest('.spoiler');
      if (sp && !sp.classList.contains('revealed')) { e.preventDefault(); sp.classList.add('revealed'); return; }
      const blurred = t.closest('.d-media.is-blurred');
      if (blurred) { e.preventDefault(); blurred.classList.remove('is-blurred'); return; }
      const act = t.closest('[data-dact]')?.dataset.dact;
      if (!act || !p) return;
      if (act === 'copy') {
        Promise.resolve().then(() => navigator.clipboard.writeText(p.permalink))
          .then(() => toast('Link kopiert'))
          .catch(() => toast('Kopieren ging nicht. Der Link steht unter „Auf Reddit öffnen“.'));
      }
      if (act === 'add-sub') openAdd({ type: 'sub', target: p.sub });
      if (act === 'add-user') openAdd({ type: 'user', target: p.author });
      if (act === 'retry-comments') loadComments(p);
    });
    dBody.addEventListener('change', (e) => {
      if (e.target.id === 'dc-sort' && drawer.post) { drawer.commentSort = e.target.value; loadComments(drawer.post); }
    });

    // Dialog: Spalte hinzufügen
    $('#add-type').addEventListener('click', (e) => {
      const b = e.target.closest('[data-type]');
      if (!b) return;
      add.type = b.dataset.type;
      $('#add-error').hidden = true;
      syncAddForm();
      if (add.type !== 'home') $('#add-target').focus();
    });
    $('#add-sort').addEventListener('change', syncAddT);
    $('#add-target').addEventListener('input', () => { $('#add-error').hidden = true; autocomplete(); });
    $('#add-chips').addEventListener('click', (e) => {
      const chip = e.target.closest('[data-chip]');
      if (!chip) return;
      $('#add-target').value = chip.dataset.chip;
      $('#add-target').focus();
    });
    $('#form-add').addEventListener('submit', submitAdd);

    // Dialoge allgemein
    for (const dlg of [dlgAdd, dlgSet]) {
      dlg.addEventListener('click', (e) => {
        if (e.target === dlg || e.target.closest('[data-close]')) dlg.close();
      });
    }

    // Dialog: Einstellungen
    dlgSet.addEventListener('click', (e) => {
      const b = e.target.closest('.seg[data-setting] button');
      if (!b) return;
      const key = b.closest('.seg').dataset.setting;
      state.settings[key] = b.dataset.v;
      save(); applySettings(); syncSettingsForm();
      if (key !== 'theme') rerenderAll();
    });
    dlgSet.addEventListener('change', (e) => {
      const k = e.target.dataset?.check;
      if (!k) return;
      state.settings[k] = e.target.checked;
      save(); applySettings();
      if (k === 'hideNsfw' || k === 'hidePinned') rerenderAll();
    });
    let muteTimer = 0;
    $('#set-mute').addEventListener('input', (e) => {
      clearTimeout(muteTimer);
      muteTimer = setTimeout(() => {
        state.settings.mute = e.target.value.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 200);
        save(); rerenderAll();
      }, 400);
    });
    $('#io-copy').addEventListener('click', () => {
      const ta = $('#set-io');
      Promise.resolve().then(() => navigator.clipboard.writeText(ta.value))
        .then(() => toast('Konfiguration kopiert'))
        .catch(() => { ta.focus(); ta.select(); toast('Text ist markiert. Mit Strg+C kopieren.'); });
    });
    $('#io-import').addEventListener('click', () => {
      let data;
      try { data = JSON.parse($('#set-io').value); } catch { toast('Das ist kein gültiger Subdeck-Text.'); return; }
      const cols = Array.isArray(data?.columns) ? data.columns.map((c) => normCol({ ...c, id: uid() })).filter(Boolean) : [];
      if (!cols.length) { toast('Im Text stehen keine Spalten.'); return; }
      replaceAll(cols, { ...state.settings, ...(data.settings || {}) });
      dlgSet.close();
      toast(`${cols.length} ${cols.length === 1 ? 'Spalte' : 'Spalten'} übernommen`);
    });
    $('#io-clear-read').addEventListener('click', () => {
      readSet.clear();
      readList = [];
      try { localStorage.removeItem(READ_KEY); } catch { /* egal */ }
      $$('.post.is-read').forEach((el) => el.classList.remove('is-read'));
      syncSettingsForm();
      toast('Gelesen-Verlauf gelöscht');
    });
    $('#io-reset').addEventListener('click', (e) => {
      const b = e.currentTarget;
      if (!b.dataset.armed) {
        b.dataset.armed = '1';
        b.textContent = 'Wirklich alles zurücksetzen?';
        setTimeout(() => { delete b.dataset.armed; b.textContent = 'Alles zurücksetzen'; }, 4000);
        return;
      }
      replaceAll(defaultColumns(), DEFAULT_SETTINGS);
      dlgSet.close();
      toast('Auf Standard zurückgesetzt');
    });

    // Tastatur
    document.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') tick(); });
  }
  function endDrag() {
    $$('.is-dragging, .drop-before, .drop-after', deck).forEach((n) => n.classList.remove('is-dragging', 'drop-before', 'drop-after'));
    dragId = null;
  }
  function colAction(c, act, btn) {
    switch (act) {
      case 'refresh': loadColumn(c, 'refresh', { manual: true }); break;
      case 'retry': loadColumn(c, 'reset', { manual: true }); break;
      case 'config': toggleConfig(c); break;
      case 'apply': applyPending(c); break;
      case 'left': moveColumn(c, -1); break;
      case 'right': moveColumn(c, 1); break;
      case 'remove':
        if (btn.dataset.armed) { removeColumn(c); break; }
        btn.dataset.armed = '1';
        btn.textContent = 'Wirklich entfernen?';
        setTimeout(() => { if (btn.isConnected) { delete btn.dataset.armed; btn.textContent = 'Entfernen'; } }, 4000);
        break;
    }
  }

  function currentPostEl() {
    const a = document.activeElement?.closest?.('.post');
    if (a) return a;
    if (drawer.postId && drawer.colId) return $(`.post[data-id="${CSS.escape(drawer.postId)}"]`, colEl(drawer.colId) || document);
    return null;
  }
  function focusPost(el) {
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: 'nearest' });
  }
  function movePost(dir) {
    const cur = currentPostEl();
    if (!cur) { focusPost($('.col .post', deck)); return; }
    let n = dir > 0 ? cur.nextElementSibling : cur.previousElementSibling;
    while (n && !n.classList.contains('post')) n = dir > 0 ? n.nextElementSibling : n.previousElementSibling;
    if (n) focusPost(n);
  }
  function moveCol(dir) {
    const cols = $$('.col', deck);
    if (!cols.length) return;
    const curCol = document.activeElement?.closest?.('.col');
    let i = curCol ? cols.indexOf(curCol) + dir : 0;
    i = Math.max(0, Math.min(cols.length - 1, i));
    const target = cols[i];
    target.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
    const list = $('.col-list', target);
    const firstVisible = $$('.post', list).find((p) => p.offsetTop + p.offsetHeight > list.scrollTop) || $('.post', list);
    (firstVisible || list).focus({ preventScroll: true });
  }
  function onKey(e) {
    if (e.key === 'Escape') {
      if (document.querySelector('dialog[open]')) return;
      if (isDrawerOpen()) { e.preventDefault(); closeDrawer(); }
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.querySelector('dialog[open]')) return;
    if (e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    switch (k) {
      case 'n': e.preventDefault(); openAdd(); break;
      case 'r': e.preventDefault(); refreshAll(); toast('Alle Spalten werden aktualisiert'); break;
      case 'j': case 'k':
        e.preventDefault();
        if (isDrawerOpen()) drawerStep(k === 'j' ? 1 : -1); else movePost(k === 'j' ? 1 : -1);
        break;
      case 'h': case 'l': e.preventDefault(); moveCol(k === 'l' ? 1 : -1); break;
      case 'o': {
        const el = currentPostEl();
        if (el) { const c = el.closest('.col'); openDrawer(c.dataset.col, el.dataset.id); }
        break;
      }
      case 'v': {
        const p = drawer.post || (() => { const el = currentPostEl(); return el ? findPost(el.closest('.col').dataset.col, el.dataset.id) : null; })();
        if (p) { markRead(p.id); window.open(p.permalink, '_blank', 'noopener'); }
        break;
      }
      case '?': openSettings('keys'); break;
      default:
        if (/^[1-9]$/.test(k)) { const c = state.columns[+k - 1]; if (c) jumpTo(c.id); }
    }
  }

  // ---------------------------------------------------------------- Taktgeber
  function tick() {
    const visible = document.visibilityState === 'visible';
    if (!visible && !state.settings.bgRefresh) return;
    const now = Date.now();
    for (const c of state.columns) {
      const r = rt(c.id);
      if (!c.refresh || r.loading) continue;
      if (r.error && ['notfound', 'private', 'perm'].includes(r.error.kind)) continue;
      if (now >= r.nextAt) loadColumn(c, 'refresh');
    }
  }

  // ---------------------------------------------------------------- Start
  async function hasPermission() {
    if (!IS_EXT || !extApi.permissions?.contains) return true;
    try { return await extApi.permissions.contains(HOST); } catch { return true; }
  }
  async function init() {
    applySettings();
    buildDeck();
    renderRail();
    bindEvents();
    setInterval(tick, 10000);
    setInterval(updateTimes, 30000);
    // Wer sich in einem anderen Tab bei Reddit anmeldet und zurückkommt, soll nicht erst klicken müssen.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      state.columns.forEach((c) => { if (rt(c.id).error?.kind === 'blocked') loadColumn(c, 'reset'); });
    });
    if (!(await hasPermission())) {
      showBanner('perm');
      state.columns.forEach((c) => {
        const r = rt(c.id);
        r.error = new ApiError('perm', 'Erlaube Subdeck oben den Zugriff auf reddit.com, dann laden die Beiträge.');
        renderList(c); renderHead(c);
      });
      return;
    }
    state.columns.forEach((c) => loadColumn(c, 'reset'));
  }
  init();
})();
