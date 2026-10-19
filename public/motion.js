// Decoration only. Every effect here starts from a page that is already complete:
// this file adds the classes that hide things before they animate in, so if it never
// loads, nothing stays hidden.
(() => {
  const html = document.documentElement;

  if (!html.classList.contains('motion')) return;

  // Count a figure up from zero: "2,345", "1.23B", "94%". Anything else (ranks, times, "7h 12m") is left alone.
  const countUp = (root, delay) => {
    for (const el of root.querySelectorAll('.stat strong, .kv dd')) {
      const node = el.firstChild;
      if (!node || node.nodeType !== 3) continue;
      const m = node.data.match(/^(\s*)(\d[\d,]*(?:\.\d+)?)([KMB%]?\s*)$/);
      if (!m) continue;
      const [, pre, num, post] = m;
      const target = parseFloat(num.replace(/,/g, ''));
      if (!(target > 0)) continue;
      const dec = (num.split('.')[1] || '').length;
      const commas = num.includes(',');
      const fmt = (v) => (commas ? v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }) : v.toFixed(dec));
      node.data = pre + fmt(0) + post;
      setTimeout(() => {
        const t0 = performance.now();
        const step = (t) => {
          const p = Math.min(1, (t - t0) / 1100);
          node.data = pre + fmt(target * (1 - Math.pow(1 - p, 3))) + post;
          if (p < 1) requestAnimationFrame(step);
          else node.data = pre + num + post;
        };
        requestAnimationFrame(step);
      }, delay);
    }
  };

  // Stagger index for the marks inside a chart, so bars and cells draw in one after another.
  const index = (root) => {
    for (const set of root.querySelectorAll('.weekbars, .heatmap svg, .ticks, .shares')) {
      set.querySelectorAll('.bar, rect[class], i, .track i').forEach((el, i) => el.style.setProperty('--i', i));
    }
  };

  const targets = document.querySelectorAll(
    '.section-head, .card, .tile, .row, .prow, .resume-card, .stats .group, .chips, .pager, .project-main > :not(.hero-figure), .notfound .links'
  );
  let first = true;
  const io = new IntersectionObserver((entries) => {
    // Elements already on screen when a view transition lands appear at once instead of animating twice.
    const instant = first && html.classList.contains('arrived');
    first = false;
    let n = 0;
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const el = e.target;
      io.unobserve(el);
      if (instant) el.classList.add('now');
      else {
        const d = Math.min(n++, 6) * 70;
        el.style.setProperty('--d', `${d}ms`);
        index(el);
        countUp(el, d + 150);
      }
      el.classList.add('in');
    }
  }, { rootMargin: '0px 0px -6% 0px' });
  for (const el of targets) {
    el.classList.add('rv');
    io.observe(el);
  }
})();
