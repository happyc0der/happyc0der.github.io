// Behaviour every visitor with JS gets, motion or not: the mobile menu, the header's see-through state,
// the New York clock, copy-to-clipboard and click-to-load demos. Everything that moves lives in motion.ts,
// which is fetched only when Base.astro has set .motion (JS on, reduced motion off).
const html = document.documentElement;

// ---- Header: see-through over the top of the page, frosted once scrolled ----
const atTop = () => html.classList.toggle('at-top', scrollY < 24);
atTop();
addEventListener('scroll', atTop, { passive: true });

// ---- Mobile menu: a full-screen dialog-like panel; focus stays inside while it is open ----
const btn = document.querySelector<HTMLButtonElement>('.menu-btn');
const menu = document.getElementById('menu');
if (btn && menu) {
  const label = btn.querySelector('.menu-btn-text');
  const isOpen = () => btn.getAttribute('aria-expanded') === 'true';
  const focusables = () => [btn, ...menu.querySelectorAll<HTMLElement>('a[href], button')];
  let hideTimer = 0;
  const setOpen = (open: boolean, returnFocus = true) => {
    if (open === isOpen()) return;
    btn.setAttribute('aria-expanded', String(open));
    if (label) label.textContent = open ? 'Close' : 'Menu';
    html.classList.toggle('menu-open', open);
    dispatchEvent(new CustomEvent('kr:menu', { detail: open }));
    clearTimeout(hideTimer);
    if (open) {
      menu.hidden = false;
      requestAnimationFrame(() => requestAnimationFrame(() => menu.classList.add('is-open')));
      menu.querySelector<HTMLElement>('a[href]')?.focus({ preventScroll: true });
    } else {
      menu.classList.remove('is-open');
      hideTimer = window.setTimeout(() => (menu.hidden = true), html.classList.contains('motion') ? 600 : 0);
      if (returnFocus) btn.focus({ preventScroll: true });
    }
  };
  btn.addEventListener('click', () => setOpen(!isOpen()));
  menu.addEventListener('click', (e) => { if ((e.target as Element).closest('a')) setOpen(false, false); });
  document.addEventListener('keydown', (e) => {
    if (!isOpen()) return;
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); return; }
    if (e.key !== 'Tab') return;
    const list = focusables(), first = list[0], last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  matchMedia('(min-width: 900px)').addEventListener('change', (m) => { if (m.matches) setOpen(false, false); });
  addEventListener('pageshow', () => setOpen(false, false));
}

// ---- Footer clock: local time in New York, where I am ----
const clock = document.querySelector<HTMLElement>('[data-clock]');
if (clock) {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false });
  const tick = () => { clock.textContent = fmt.format(new Date()); };
  tick();
  clock.hidden = false;
  clock.setAttribute('aria-label', 'Local time in New York');
  setInterval(tick, 15000);
}

// ---- Copy the email address. Without clipboard access the link falls back to mailto: ----
for (const el of document.querySelectorAll<HTMLAnchorElement>('[data-copy]')) {
  const note = el.parentElement?.querySelector<HTMLElement>('[data-copy-note]');
  el.addEventListener('click', async (e) => {
    if (!navigator.clipboard) return;
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(el.dataset.copy!);
      if (note) note.textContent = 'Copied to the clipboard.';
      dispatchEvent(new CustomEvent('kr:cursor', { detail: 'Copied' }));
    } catch {
      location.href = el.href;
    }
  });
}

// ---- Live demos: the poster links to the demo page; here a click loads it in place instead ----
for (const box of document.querySelectorAll<HTMLElement>('[data-demo]')) {
  const run = box.querySelector<HTMLAnchorElement>('[data-demo-run]');
  const full = box.parentElement?.querySelector<HTMLButtonElement>('[data-demo-full]');
  run?.addEventListener('click', (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    const frame = document.createElement('iframe');
    frame.src = box.dataset.demo!;
    frame.title = box.dataset.demoTitle || 'Live demo';
    frame.loading = 'lazy';
    frame.allow = 'fullscreen';
    frame.referrerPolicy = 'no-referrer';
    run.replaceWith(frame);
    frame.focus();
    if (full && box.requestFullscreen) full.hidden = false;
    dispatchEvent(new Event('kr:layout'));
  });
  full?.addEventListener('click', () => box.requestFullscreen?.());
}

// ---- Swipe row on phones: keep the "01 / 09" counter in step with the card in view ----
const viewport = document.querySelector<HTMLElement>('[data-work-track]');
const counter = document.querySelector<HTMLElement>('[data-work-index]');
if (viewport && counter) {
  const cards = [...viewport.children] as HTMLElement[];
  const total = cards.length - 1;   // the last item is the "all projects" link
  viewport.addEventListener('scroll', () => {
    const x = viewport.scrollLeft + viewport.clientWidth * 0.3;
    const i = cards.findLastIndex((c) => c.offsetLeft <= x);
    counter.textContent = String(Math.min(total, Math.max(1, i + 1))).padStart(2, '0');
  }, { passive: true });
}

if (html.classList.contains('motion')) import('./motion').then((m) => m.start());
