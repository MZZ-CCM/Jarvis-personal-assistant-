// Tiny DOM toolkit: element builder, icons, page chrome, sheets, toasts.
// All dynamic text goes through text nodes, never innerHTML.

export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v; // static, trusted markup only (icons)
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (['value', 'checked', 'disabled', 'selected'].includes(k)) el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : String(kid));
  }
  return el;
}

/* ---------- Icons (SF Symbols–style strokes) ---------- */

const PATHS = {
  calendar: '<rect x="3" y="4.5" width="18" height="16.5" rx="3"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
  inbox: '<path d="M3 13.5V18a2.5 2.5 0 0 0 2.5 2.5h13A2.5 2.5 0 0 0 21 18v-4.5"/><path d="M3 13.5 5.6 5.4A2 2 0 0 1 7.5 4h9a2 2 0 0 1 1.9 1.4L21 13.5h-5a4 4 0 0 1-8 0H3Z"/>',
  sparkles: '<path d="M11 3.5l1.8 4.9 4.9 1.8-4.9 1.8L11 16.9l-1.8-4.9-4.9-1.8 4.9-1.8Z"/><path d="M18.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8Z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  chevron: '<path d="M9 5l7 7-7 7"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
  up: '<path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/>',
  bell: '<path d="M6 16v-5a6 6 0 1 1 12 0v5l1.5 2h-15Z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 1 1 13 0c0 5.4-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.3"/>',
  trash: '<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3.5 6.5 12 13l8.5-6.5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  share: '<path d="M12 3v12M8 7l4-4 4 4"/><path d="M7 10.5H6a1.5 1.5 0 0 0-1.5 1.5v7.5A1.5 1.5 0 0 0 6 21h12a1.5 1.5 0 0 0 1.5-1.5V12a1.5 1.5 0 0 0-1.5-1.5h-1"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="2"/>',
  send: '<path d="M4 12 20 4l-4 16-4-6.5Z"/><path d="M20 4 12 13.5"/>',
  checklist: '<path d="M4 6.5l1.5 1.5L8 5.5M4 12.5l1.5 1.5L8 11.5M4 18.5l1.5 1.5L8 17.5M11 7h9M11 13h9M11 19h9"/>',
  alert: '<path d="M12 4 2.5 20h19Z"/><path d="M12 10v4.5M12 17.5v.01"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16.5 6.5l2.5 2.5M14 9l2 2"/>',
  note: '<path d="M6 3.5h8.5L19 8v11a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19V5a1.5 1.5 0 0 1 1-1.5Z"/><path d="M14 3.5V8h5M8.5 12.5h7M8.5 16h5"/>',
  pulse: '<path d="M3 12h4l2.5-6 5 12 2.5-6h4"/>',
  download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14"/>',
  upload: '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 19.5h14"/>',
  chip: '<rect x="6" y="6" width="12" height="12" rx="2.5"/><path d="M9 2.5v3.5M15 2.5v3.5M9 18v3.5M15 18v3.5M2.5 9H6M2.5 15H6M18 9h3.5M18 15h3.5"/><path d="M10 10h4v4h-4z"/>',
  pen: '<path d="M4 20l1-4.5L15.5 5a2.1 2.1 0 0 1 3 3L8 18.5Z"/><path d="M13.5 7l3 3"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5Z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/>',
};

export function icon(name, { size, label } = {}) {
  return h('span', {
    class: 'icon',
    style: size ? `width:${size}px;height:${size}px` : null,
    'aria-hidden': label ? null : 'true',
    'aria-label': label || null,
    role: label ? 'img' : null,
    html: `<svg viewBox="0 0 24 24">${PATHS[name] || ''}</svg>`,
  });
}

export function iconButton(name, label, onclick, cls = '') {
  return h('button', { class: `icon-btn ${cls}`, type: 'button', 'aria-label': label, title: label, onclick }, icon(name));
}

export const orb = (size = '', thinking = false) => h('div', { class: `orb ${size} ${thinking ? 'thinking' : ''}`, 'aria-hidden': 'true' });

/* ---------- Page chrome ---------- */

let titleObserver;

/**
 * Renders an iOS-style page: sticky nav bar + large title that collapses on scroll.
 * Returns the content container.
 */
export function mountPage({ title, navTitle, eyebrow, subtitle, back, actions = [], large = true, display = false }) {
  const view = document.getElementById('view');
  titleObserver?.disconnect();

  const nav = h('header', { class: `navbar ${large ? '' : 'solid'}` },
    h('div', { class: 'nav-left' },
      back ? h('a', { class: 'back-btn', href: back.href, 'aria-label': `Back to ${back.label}` }, icon('back'), h('span', {}, back.label)) : null),
    h('div', { class: 'nav-title', 'aria-hidden': large ? 'true' : null }, navTitle ?? (typeof title === 'string' ? title : '')),
    h('div', { class: 'nav-right' }, actions));

  const hero = large
    ? h('div', { class: 'hero' },
        eyebrow ? h('p', { class: 'eyebrow' }, eyebrow) : null,
        h('h1', { class: `large-title ${display ? 'display' : ''}` }, title),
        subtitle ? h('p', { class: 'subtitle' }, subtitle) : null)
    : null;

  const content = h('div', { class: 'content' });
  view.replaceChildren(nav, ...(hero ? [hero] : []), content);
  window.scrollTo(0, 0);
  // Re-trigger the entrance choreography (see .page-enter in immersive.css).
  view.classList.remove('page-enter');
  void view.offsetWidth;
  view.classList.add('page-enter');
  setTimeout(() => content.classList.add('settled'), 1400); // later live re-renders don't re-animate

  if (hero) {
    const heading = hero.querySelector('h1');
    titleObserver = new IntersectionObserver(
      ([e]) => nav.classList.toggle('scrolled', !e.isIntersecting),
      { rootMargin: `-${nav.offsetHeight}px 0px 0px 0px` }
    );
    titleObserver.observe(heading);
  }
  return content;
}

export function section(title, children, { caption, footnote, aside } = {}) {
  return h('section', { class: 'section' },
    title ? h('h2', { class: 'section-title' }, h('span', {}, title), aside ? (aside instanceof Node ? aside : h('small', {}, aside)) : null) : null,
    caption ? h('p', { class: 'section-caption' }, caption) : null,
    h('div', { class: 'group' }, children),
    footnote ? h('p', { class: 'footnote' }, footnote) : null);
}

export const skeleton = (rows = 3) => h('div', { class: 'skeleton', 'aria-hidden': 'true' }, Array.from({ length: rows * 2 }, () => h('div')));

export function empty(iconName, title, text) {
  return h('div', { class: 'empty' }, icon(iconName), h('strong', {}, title), text ? h('span', {}, text) : null);
}

export function noteCard(iconName, title, text, actions = [], cls = '') {
  return h('div', { class: `card note ${cls}` },
    icon(iconName),
    h('div', { style: 'flex:1;min-width:0' },
      h('div', { class: 'card-title' }, title),
      text ? h('p', { class: 'card-text' }, text) : null,
      actions.length ? h('div', { class: 'actions' }, actions) : null));
}

export function segmented(options, selected, onChange, label) {
  const el = h('div', { class: 'segmented', role: 'group', 'aria-label': label });
  const buttons = options.map(([value, text]) => h('button', {
    type: 'button', 'aria-pressed': String(value === selected),
    onclick: () => {
      buttons.forEach((b) => b.setAttribute('aria-pressed', String(b === btnFor(value))));
      onChange(value);
    },
  }, text));
  const btnFor = (v) => buttons[options.findIndex(([val]) => val === v)];
  el.append(...buttons);
  return el;
}

export function chipGroup(options, selected, onChange, label) {
  const el = h('div', { class: 'chips', role: 'group', 'aria-label': label });
  for (const [value, text] of options) {
    el.append(h('button', {
      type: 'button', class: 'chip', 'aria-pressed': String(value === selected),
      onclick: (e) => {
        el.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c === e.currentTarget)));
        onChange(value);
      },
    }, text));
  }
  return el;
}

export function toggle(checked, onChange, label) {
  const input = h('input', { type: 'checkbox', role: 'switch', checked, 'aria-label': label, onchange: (e) => onChange(e.target.checked) });
  return h('label', { class: 'switch' }, input, h('span'));
}

export function setLoading(btn, loading, text) {
  btn.classList.toggle('loading', loading);
  btn.disabled = loading;
  if (text != null) {
    const label = [...btn.childNodes].find((n) => n.nodeType === 3 || (n.tagName === 'SPAN' && !n.classList.contains('icon')));
    if (label) label.textContent = text;
  }
}

/* ---------- Toast ---------- */

let toastTimer;
export function toast(message, kind = 'ok', { action, onAction } = {}) {
  const el = document.getElementById('toast');
  el.className = kind === 'error' ? 'error' : '';
  el.replaceChildren(icon(kind === 'error' ? 'alert' : 'check'), h('span', {}, message),
    ...(action ? [h('button', { class: 'toast-action', type: 'button', onclick: () => { el.classList.remove('show'); onAction?.(); } }, action)] : []));
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), kind === 'error' ? 4500 : action ? 5000 : 2600);
}

/* ---------- Bottom sheet (swipe down or Cancel to dismiss) ---------- */

let openSheets = 0;
export const sheetOpen = () => openSheets > 0;

export function sheet({ title, body, primary, cancelLabel = 'Cancel', onClose }) {
  const backdrop = h('div', { class: 'sheet-backdrop' });
  const primaryBtn = primary
    ? h('button', { class: 'text-btn primary', type: 'button', disabled: !!primary.disabled }, primary.label)
    : h('span');
  const heading = h('h2', {}, title);
  const head = h('div', { class: 'sheet-head' },
    h('button', { class: 'text-btn', type: 'button', onclick: () => close() }, cancelLabel),
    heading,
    primaryBtn);
  const panel = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'grabber', 'aria-hidden': 'true' }), head, h('div', { class: 'sheet-body' }, body));

  const lastFocus = document.activeElement;
  document.body.append(backdrop, panel);
  document.body.style.overflow = 'hidden';
  openSheets++;
  requestAnimationFrame(() => { backdrop.classList.add('open'); panel.classList.add('open'); });

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    openSheets--;
    panel.classList.remove('open');
    backdrop.classList.remove('open');
    panel.style.transform = '';
    if (!openSheets) document.body.style.overflow = '';
    setTimeout(() => { panel.remove(); backdrop.remove(); lastFocus?.focus?.(); }, 380);
    onClose?.();
  }

  if (primary) {
    primaryBtn.addEventListener('click', async () => {
      primaryBtn.disabled = true;
      try {
        const keepOpen = await primary.onClick();
        if (keepOpen !== true) close();
      } catch (e) {
        toast(e.message || String(e), 'error');
      } finally {
        primaryBtn.disabled = false;
      }
    });
  }

  backdrop.addEventListener('click', close);
  panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  // Swipe down from the header to dismiss.
  let startY = null, dy = 0;
  const onStart = (e) => { startY = e.touches[0].clientY; dy = 0; panel.classList.add('dragging'); };
  const onMove = (e) => {
    if (startY == null) return;
    dy = Math.max(0, e.touches[0].clientY - startY);
    panel.style.transform = `translateY(${dy}px)`;
  };
  const onEnd = () => {
    if (startY == null) return;
    panel.classList.remove('dragging');
    startY = null;
    if (dy > 110) close(); else panel.style.transform = '';
  };
  for (const zone of [head, panel.querySelector('.grabber')]) {
    zone.addEventListener('touchstart', onStart, { passive: true });
    zone.addEventListener('touchmove', onMove, { passive: true });
    zone.addEventListener('touchend', onEnd);
  }

  return {
    close,
    panel,
    setPrimaryEnabled(on) { if (primary) primaryBtn.disabled = !on; },
    setTitle(t) { heading.textContent = t; panel.setAttribute('aria-label', t); },
  };
}

/* ---------- Light markdown for AI text (bold + bullets), built safely ---------- */

export function richText(text = '') {
  const frag = document.createDocumentFragment();
  let list = null;
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (bullet) {
      if (!list) { list = h('ul'); frag.append(list); }
      list.append(h('li', {}, inline(bullet[1])));
      continue;
    }
    list = null;
    if (line.trim()) frag.append(h('p', {}, inline(line.replace(/^#+\s*/, ''))));
  }
  return frag;
}

function inline(text) {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part) =>
    part.startsWith('**') && part.endsWith('**') ? h('strong', {}, part.slice(2, -2)) : part.replace(/(^|\s)\*([^*]+)\*/g, '$1$2'));
}

export const plainText = (text = '') => text.replace(/\*\*/g, '').replace(/^\s*[-*•]\s+/gm, '');
