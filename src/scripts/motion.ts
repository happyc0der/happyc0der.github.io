// The whole motion layer, in one place: smooth scroll, split and scrub text, reveals, counters, the marquee,
// the cursor, the pinned "Selected work" track, parallax, the purple page wipe and the intro hand-off.
// Decoration only. It is loaded by site.ts only when Base.astro has set .motion, and every hidden state it
// animates from is either set here or scoped to .motion in motion.css, so a page without it is complete.
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger);

const html = document.documentElement;
const $ = <T extends Element = HTMLElement>(s: string, root: ParentNode = document) => root.querySelector<T>(s);
const $$ = <T extends Element = HTMLElement>(s: string, root: ParentNode = document) => [...root.querySelectorAll<T>(s)];
const mouse = matchMedia('(hover: hover) and (pointer: fine)').matches;

let lenis: Lenis | null = null;

export function start() {
  // Base.astro's safety timer drops .motion if this arrived too late; then the page stays as it is.
  if (!html.classList.contains('motion')) return;
  html.classList.add('motion-ready');

  smoothScroll();
  links();
  const intro = prepareSplits();
  scrubs();
  reveals();
  marquee();
  ticker();
  workTrack();
  parallax();
  progressFallback();
  if (mouse) { cursor(); magnetic(); floatingThumbs(); }

  // The hero (and each page's title) plays once the intro counter or the arriving wipe is out of the way.
  const go = () => intro();
  if (html.classList.contains('preload') && !html.classList.contains('intro-go')) addEventListener('kr:intro', go, { once: true });
  else if (html.classList.contains('wipe-in')) setTimeout(go, 280);
  else go();

  addEventListener('kr:layout', () => ScrollTrigger.refresh());
  // Fonts change line breaks and heights: measure again once they are in.
  document.fonts?.ready.then(() => ScrollTrigger.refresh());
}

// ---------------------------------------------------------------- smooth scroll
// Lenis smooths wheel scrolling only; touch keeps the platform's native scroll.
function smoothScroll() {
  lenis = new Lenis({ autoRaf: false, lerp: 0.11, smoothWheel: true, syncTouch: false });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis!.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
  addEventListener('kr:menu', (e) => ((e as CustomEvent).detail ? lenis!.stop() : lenis!.start()));
}

const headerOffset = () => -(($('header.site')?.offsetHeight ?? 0) + 16);
function scrollToHash(hash: string, push = true) {
  const target = hash === '#top' ? 0 : document.getElementById(decodeURIComponent(hash.slice(1)));
  if (target === null) return false;
  lenis?.scrollTo(target === 0 ? 0 : target, { offset: target === 0 ? 0 : headerOffset(), duration: 1.4 });
  if (push) history.pushState(null, '', hash === '#top' ? location.pathname + location.search : hash);
  // Move keyboard focus with the scroll, as a native jump would.
  const focusTo = target === 0 ? $('#main') : target;
  if (focusTo) {
    if (!focusTo.hasAttribute('tabindex') && !focusTo.matches('a, button, input, summary')) focusTo.setAttribute('tabindex', '-1');
    focusTo.focus({ preventScroll: true });
  }
  return true;
}

// ---------------------------------------------------------------- links and the page wipe
// Same-page anchors glide. Other pages on this site: a purple panel with the destination's name sweeps up,
// then the browser navigates; the next page starts covered and the panel slides off (Base.astro + CSS).
// A link that carries a shared screenshot is left to the browser's own view transition, which morphs it.
function links() {
  const wipe = $('.wipe');
  const label = $('[data-wipe-label]');
  const nativeMorph = 'PageRevealEvent' in window;
  let leaving = false;

  const nameFor = (a: HTMLAnchorElement, url: URL) => {
    if (a.dataset.label) return a.dataset.label;
    const text = (a.textContent || '').replace(/\s+/g, ' ').trim();
    if (text && text.split(' ').length <= 3) return text;
    const map: Record<string, string> = { '/': 'Home', '/projects/': 'Projects', '/resume/': 'Resume', '/notes/': 'Notes' };
    return map[url.pathname] ?? 'Loading';
  };

  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as Element).closest<HTMLAnchorElement>('a[href]');
    if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin) return;
    if (url.pathname === location.pathname && url.search === location.search) {
      if (url.hash && scrollToHash(url.hash)) e.preventDefault();
      return;
    }
    // Files and demos open as themselves.
    if (/\.[a-z0-9]{2,4}$/i.test(url.pathname) || url.pathname.startsWith('/demos/')) return;
    if (nativeMorph && a.querySelector('[style*="view-transition-name"]')) return;
    if (!wipe || !label) return;
    e.preventDefault();
    if (leaving) return;
    leaving = true;
    const name = nameFor(a, url);
    label.textContent = name;
    try { sessionStorage.setItem('kr-wipe', name); } catch {}
    lenis?.stop();
    wipe.classList.add('is-covering');
    setTimeout(() => location.assign(url.href), 520);
  });
  // The wipe replaces the native cross-page transition; never run both.
  addEventListener('pageswap', (e: any) => { if (leaving && e.viewTransition) e.viewTransition.skipTransition(); });
  // Coming back through the back/forward cache: lift the panel we left down.
  addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    leaving = false;
    wipe?.classList.remove('is-covering');
    html.classList.remove('wipe-in');
    lenis?.start();
  });

  // Arriving with a hash (/#numbers from another page): land on it once the layout has settled.
  if (location.hash.length > 1) {
    const h = location.hash;
    requestAnimationFrame(() => setTimeout(() => {
      const t = document.getElementById(decodeURIComponent(h.slice(1)));
      if (t) lenis?.scrollTo(t, { offset: headerOffset(), immediate: true, force: true });
    }, 60));
  }
}

// ---------------------------------------------------------------- split text
// [data-split] headings: words (or letters, data-split="chars") in masks, rising line by line.
// Letter splits keep a screen-reader copy of the plain text and hide the pieces from assistive tech.
function wrap(root: Node, chars: boolean, out: HTMLElement[], words: HTMLElement[]) {
  for (const node of [...root.childNodes]) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node as Text).data;
      if (!text.trim()) continue;
      const frag = document.createDocumentFragment();
      for (const part of text.split(/(\s+)/)) {
        if (!part) continue;
        if (/^\s+$/.test(part)) { frag.append(' '); continue; }
        // A hyphenated word may still break after its hyphens, as it would unsplit.
        for (const piece of part.split(/(?<=-)/)) {
          const mask = document.createElement('span');
          mask.className = 'sw';
          const inner = document.createElement('span');
          inner.className = 'swi';
          if (chars) {
            for (const c of piece) {
              const s = document.createElement('span');
              s.className = 'sc';
              s.textContent = c;
              inner.append(s);
              out.push(s);
            }
          } else {
            inner.textContent = piece;
            out.push(inner);
          }
          mask.append(inner);
          frag.append(mask);
          words.push(mask);
        }
      }
      node.replaceWith(frag);
    } else if (node.nodeType === Node.ELEMENT_NODE && !(node as Element).matches('br, svg, img, .sr-only')) {
      wrap(node, chars, out, words);
    }
  }
}

function prepareSplits() {
  const now: ((delay: number) => void)[] = [];
  for (const el of $$('[data-split]')) {
    const chars = el.dataset.split === 'chars';
    if (chars) {
      const sr = document.createElement('span');
      sr.className = 'sr-only';
      sr.textContent = el.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      const visual = document.createElement('span');
      visual.setAttribute('aria-hidden', 'true');
      visual.append(...el.childNodes);
      el.append(sr, visual);
    }
    const targets: HTMLElement[] = [], words: HTMLElement[] = [];
    wrap(el, chars, targets, words);
    gsap.set(targets, { yPercent: 118, rotate: chars ? 6 : 0 });
    el.classList.add('is-split');

    const play = (delay = 0) => {
      // Stagger by line first (from where each word sits now), then along the line.
      const tops = words.map((w) => w.offsetTop);
      const lines = [...new Set(tops)].sort((a, b) => a - b);
      const lineOf = new Map<HTMLElement, number>();
      let w = 0;
      for (const t of targets) {
        while (w < words.length - 1 && !words[w].contains(t)) w++;
        lineOf.set(t, lines.indexOf(tops[w]));
      }
      const perLine = new Map<number, number>();
      gsap.to(targets, {
        yPercent: 0, rotate: 0, duration: chars ? 1.15 : 1.05, ease: 'expo.out', delay,
        stagger: (i) => {
          const line = lineOf.get(targets[i]) ?? 0;
          const k = perLine.get(line) ?? 0;
          perLine.set(line, k + 1);
          return line * 0.12 + k * (chars ? 0.035 : 0.045);
        },
        onComplete: () => el.classList.add('is-done'),
      });
    };
    if (el.hasAttribute('data-intro')) now.push(play);
    else ScrollTrigger.create({ trigger: el, start: 'top 90%', once: true, onEnter: () => play() });
  }
  // Intro blocks (the hero's bottom row, a project's meta row) rise after the titles.
  const blocks = $$('[data-reveal-intro]');
  return () => {
    now.forEach((play, i) => play(i * 0.1));
    blocks.forEach((b, i) => { b.style.setProperty('--d', `${380 + i * 90}ms`); b.classList.add('is-in'); });
  };
}

// ---------------------------------------------------------------- scrub reveal
// [data-scrub] paragraphs fill in word by word, from a dim tone to full text, tied to the scroll position.
function scrubs() {
  const css = getComputedStyle(html);
  const from = css.getPropertyValue('--dim').trim() || '#4f4a63';
  for (const el of $$('[data-scrub]')) {
    const words: HTMLElement[] = [];
    for (const node of textNodes(el)) {
      const frag = document.createDocumentFragment();
      for (const part of node.data.split(/(\s+)/)) {
        if (!part) continue;
        if (/^\s+$/.test(part)) { frag.append(part); continue; }
        const s = document.createElement('span');
        s.textContent = part;
        words.push(s);
        frag.append(s);
      }
      node.replaceWith(frag);
    }
    const to = getComputedStyle(el).color;
    gsap.fromTo(words, { color: from }, {
      color: to, ease: 'none', stagger: 0.1,
      scrollTrigger: { trigger: el, start: 'top 82%', end: 'bottom 48%', scrub: 0.6 },
    });
  }
}
function textNodes(root: Node) {
  const out: Text[] = [];
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walk.nextNode()) if ((walk.currentNode as Text).data.trim()) out.push(walk.currentNode as Text);
  return out;
}

// ---------------------------------------------------------------- reveals and counters
function reveals() {
  const targets = $$('[data-reveal], .tile, .stats .group');
  // Stagger index for the marks inside a chart, so bars and cells draw in one after another.
  for (const set of $$('.weekbars, .heatmap svg, .ticks, .shares')) {
    $$('.bar, rect[class], i, .track i', set).forEach((el, i) => el.style.setProperty('--i', String(i)));
  }
  ScrollTrigger.batch(targets, {
    start: 'top 92%',
    once: true,
    onEnter: (batch) => batch.forEach((el, i) => {
      const d = Math.min(i, 6) * 80;
      el.style.setProperty('--d', `${d}ms`);
      el.classList.add('is-in');
      countUp(el, d + 150);
    }),
  });
}

// Count a figure up from zero: "2,345", "1.23B", "94%". Anything else (ranks, times, "7h 12m") is left alone.
function countUp(root: HTMLElement, delay: number) {
  for (const el of $$('[data-count], .stat strong, .kv dd', root)) {
    const node = el.firstChild;
    if (!node || node.nodeType !== Node.TEXT_NODE) continue;
    const t = node as Text;
    const m = t.data.match(/^(\s*)(\d[\d,]*(?:\.\d+)?)([KMB%]?\s*)$/);
    if (!m) continue;
    const [, pre, num, post] = m;
    const target = parseFloat(num.replace(/,/g, ''));
    if (!(target > 0)) continue;
    const dec = (num.split('.')[1] || '').length;
    const commas = num.includes(',');
    const fmt = (v: number) => (commas ? v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }) : v.toFixed(dec));
    const state = { v: 0 };
    t.data = pre + fmt(0) + post;
    gsap.to(state, { v: target, duration: 1.4, ease: 'expo.out', delay: delay / 1000, onUpdate: () => { t.data = pre + fmt(state.v) + post; }, onComplete: () => { t.data = pre + num + post; } });
  }
}

// ---------------------------------------------------------------- marquee
// Drifts left; scrolling speeds it up, and scrolling back up turns it around.
function marquee() {
  const track = $('[data-marquee]');
  if (!track) return;
  track.classList.add('is-driven');
  let half = track.scrollWidth / 2, x = 0, dir = -1, lastY = scrollY, visible = true, skew = 0;
  new ResizeObserver(() => (half = track.scrollWidth / 2)).observe(track);
  new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(track);
  gsap.ticker.add((_t, dt) => {
    const v = scrollY - lastY;
    lastY = scrollY;
    if (!visible) return;
    if (Math.abs(v) > 0.5) dir = v > 0 ? -1 : 1;
    const speed = 55 + Math.min(Math.abs(v) * 40, 1400);
    x += (dir * speed * dt) / 1000;
    if (x <= -half) x += half;
    if (x > 0) x -= half;
    skew += (gsap.utils.clamp(-8, 8, -v * 0.35) - skew) * 0.12;
    track.style.transform = `translate3d(${x}px, 0, 0) skewX(${skew.toFixed(2)}deg)`;
  });
}

// ---------------------------------------------------------------- hero ticker
// "I build ___": the role rolls up to the next one every couple of seconds while the hero is on screen.
function ticker() {
  const box = $('[data-ticker]');
  const list = box && $('.ticker-list', box);
  if (!box || !list || list.children.length < 2) return;
  list.append(list.children[0].cloneNode(true));
  const n = list.children.length - 1;
  let i = 0, on = true;
  new IntersectionObserver(([e]) => (on = e.isIntersecting)).observe(box);
  const step = () => {
    if (on && !document.hidden) {
      i++;
      gsap.to(list, {
        yPercent: (-100 * i) / (n + 1), duration: 0.9, ease: 'expo.inOut',
        onComplete: () => { if (i === n) { i = 0; gsap.set(list, { yPercent: 0 }); } },
      });
    }
    setTimeout(step, 2400);
  };
  setTimeout(step, 2600);
}

// ---------------------------------------------------------------- selected work
// On a wide screen with a mouse, the section pins and the row of cards slides sideways as you scroll.
function workTrack() {
  const section = $('[data-work]');
  const track = $('[data-work-track]');
  const counter = $('[data-work-index]');
  if (!section || !track) return;
  const cards = [...track.children].filter((c) => !c.classList.contains('work-more'));
  const mm = gsap.matchMedia();
  mm.add('(min-width: 900px) and (hover: hover) and (pointer: fine)', () => {
    section.classList.add('is-pinned');
    const distance = () => Math.max(0, track.scrollWidth - document.documentElement.clientWidth);
    const tween = gsap.to(track, {
      x: () => -distance(), ease: 'none',
      scrollTrigger: {
        trigger: section, start: 'top top', end: () => `+=${distance()}`, pin: true, scrub: 0.9, invalidateOnRefresh: true, anticipatePin: 1,
        onUpdate: (st) => {
          if (!counter) return;
          const i = Math.min(cards.length, Math.round(st.progress * (cards.length - 1)) + 1);
          counter.textContent = String(i).padStart(2, '0');
        },
      },
    });
    return () => { section.classList.remove('is-pinned'); tween.scrollTrigger?.kill(); tween.kill(); gsap.set(track, { clearProps: 'x' }); };
  });
}

// ---------------------------------------------------------------- parallax
function parallax() {
  for (const el of $$('[data-parallax]')) {
    gsap.fromTo(el, { yPercent: -3 }, { yPercent: 3, ease: 'none', scrollTrigger: { trigger: el.parentElement, start: 'top bottom', end: 'bottom top', scrub: true } });
  }
}

// ---------------------------------------------------------------- scroll progress (browsers without scroll timelines)
function progressFallback() {
  if (CSS.supports('animation-timeline: scroll()')) return;
  const bar = $('.progress');
  if (!bar) return;
  ScrollTrigger.create({ start: 0, end: 'max', onUpdate: (st) => { bar.style.transform = `scaleX(${st.progress})`; } });
}

// ---------------------------------------------------------------- cursor
// A dot that tracks the mouse exactly and a ring that follows. Links grow the ring; [data-cursor] turns it
// into a purple disc with that word. Over an iframe the page's own cursor takes over.
function cursor() {
  const ring = document.createElement('div');
  ring.className = 'cursor';
  ring.setAttribute('aria-hidden', 'true');
  ring.innerHTML = '<div class="cursor-ring"><span class="cursor-label"></span></div>';
  const dot = document.createElement('div');
  dot.className = 'cursor-dot';
  dot.setAttribute('aria-hidden', 'true');
  document.body.append(ring, dot);
  const label = ring.querySelector<HTMLElement>('.cursor-label')!;
  let mx = -100, my = -100, rx = mx, ry = my, seen = false, hover: HTMLElement | null = null;

  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    mx = e.clientX; my = e.clientY;
    if (!seen) { seen = true; rx = mx; ry = my; }
    html.classList.add('cursor-on');
    dot.style.transform = `translate3d(${mx}px, ${my}px, 0)`;
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => html.classList.remove('cursor-on'));
  addEventListener('blur', () => html.classList.remove('cursor-on'));
  gsap.ticker.add(() => {
    rx += (mx - rx) * 0.2; ry += (my - ry) * 0.2;
    ring.style.transform = `translate3d(${rx.toFixed(1)}px, ${ry.toFixed(1)}px, 0)`;
  });
  const set = (el: HTMLElement | null) => {
    hover = el;
    const text = el?.dataset.cursor ?? '';
    ring.classList.toggle('is-label', !!text);
    ring.classList.toggle('is-link', !!el && !text);
    html.classList.toggle('has-label', !!text);
    if (text) label.textContent = text;
  };
  document.addEventListener('pointerover', (e) => {
    const t = e.target as Element;
    if (t.closest('iframe')) { html.classList.remove('cursor-on'); return; }
    set(t.closest<HTMLElement>('[data-cursor], a[href], button, summary, label, [role="button"]'));
  });
  document.addEventListener('pointerdown', () => ring.classList.add('is-down'));
  document.addEventListener('pointerup', () => ring.classList.remove('is-down'));
  addEventListener('kr:cursor', (e) => {
    label.textContent = (e as CustomEvent).detail;
    setTimeout(() => { if (hover?.dataset.cursor) label.textContent = hover.dataset.cursor; }, 1400);
  });
}

// [data-magnetic] buttons lean toward the pointer and spring back when it leaves.
function magnetic() {
  for (const el of $$('[data-magnetic]')) {
    const xTo = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'power3.out' });
    const yTo = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'power3.out' });
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      xTo((e.clientX - (r.left + r.width / 2)) * 0.32);
      yTo((e.clientY - (r.top + r.height / 2)) * 0.32);
    });
    el.addEventListener('pointerleave', () => {
      gsap.to(el, { x: 0, y: 0, duration: 0.9, ease: 'elastic.out(1, 0.4)', overwrite: true });
    });
  }
}

// /projects/: the row under the mouse shows its screenshot (or headline number) beside the cursor.
function floatingThumbs() {
  const rows = $$<HTMLAnchorElement>('.prow[data-thumb], .prow[data-thumb-text]');
  if (!rows.length) return;
  const box = document.createElement('div');
  box.className = 'float-thumb';
  box.setAttribute('aria-hidden', 'true');
  document.body.append(box);
  const img = new Image();
  img.alt = '';
  img.decoding = 'async';
  const panel = document.createElement('div');
  panel.className = 'wcard-panel';
  const xTo = gsap.quickTo(box, 'x', { duration: 0.55, ease: 'power3.out' });
  const yTo = gsap.quickTo(box, 'y', { duration: 0.55, ease: 'power3.out' });
  let placed = false;
  const move = (e: PointerEvent) => {
    const w = box.offsetWidth, h = box.offsetHeight;
    const x = Math.min(innerWidth - w - 16, e.clientX + 28), y = Math.min(innerHeight - h - 16, Math.max(16, e.clientY - h / 2));
    if (!placed) { gsap.set(box, { x, y }); placed = true; }
    xTo(x); yTo(y);
  };
  for (const row of rows) {
    row.addEventListener('pointerenter', (e) => {
      box.style.setProperty('--hue', row.style.getPropertyValue('--hue'));
      if (row.dataset.thumb) { img.src = row.dataset.thumb; box.replaceChildren(img); }
      else { panel.innerHTML = ''; const s = document.createElement('span'); s.textContent = row.dataset.thumbText ?? ''; panel.append(s); box.replaceChildren(panel); }
      move(e);
      box.classList.add('is-on');
    });
    row.addEventListener('pointermove', move);
    row.addEventListener('pointerleave', () => box.classList.remove('is-on'));
  }
  addEventListener('scroll', () => box.classList.remove('is-on'), { passive: true });
}
