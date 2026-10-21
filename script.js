(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const store = {
    get: k => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  };

  // theme
  const root = document.documentElement;
  const saved = store.get('theme');
  if (saved) root.dataset.theme = saved;
  else if (matchMedia('(prefers-color-scheme: light)').matches) root.dataset.theme = 'light';
  $('#theme').addEventListener('click', () => {
    const next = root.dataset.theme === 'light' ? 'dark' : 'light';
    root.dataset.theme = next;
    store.set('theme', next);
  });

  // nav shadow + year
  const nav = $('#nav');
  const onScroll = () => nav.classList.toggle('scrolled', scrollY > 8);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  $('#yr').textContent = new Date().getFullYear();

  // reveal on scroll
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { threshold: 0, rootMargin: '0px 0px -6% 0px' });
  $$('.reveal').forEach(el => io.observe(el));

  // count-up metrics
  const countIO = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      countIO.unobserve(e.target);
      const el = e.target, end = +el.dataset.count, suf = el.dataset.suffix || '';
      if (reduce) { el.textContent = end + suf; return; }
      const t0 = performance.now(), dur = 1400;
      const tick = (t) => {
        const p = Math.min(1, (t - t0) / dur), eased = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(end * eased) + suf;
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }, { threshold: 0.6 });
  $$('[data-count]').forEach(el => countIO.observe(el));

  // hero terminal
  const lines = [
    ['$ ', 'k', 'platform.status --region all'],
    ['', 'g', '✓ brokers healthy        3/3 regions'],
    ['', 'g', '✓ services connected     300+'],
    ['', 'g', '✓ throughput             2M+ events/day · 10K RPS peak'],
    ['', 'g', '✓ schema migrations      zero-downtime, backward compatible'],
    ['', 'w', '! dead-letter queue       0 unhandled · alerting armed'],
  ];
  const term = $('#term');
  const render = (upto, partial) => {
    term.innerHTML = lines.slice(0, upto).map(([p, c, t]) => `<span class="${c}">${p}${t}</span>`).join('\n')
      + (partial != null ? '\n' + partial : '') + '<span class="k">▍</span>';
  };
  if (reduce) { render(lines.length); }
  else {
    let i = 0;
    const step = () => {
      if (i >= lines.length) return render(lines.length);
      const [p, , t] = lines[i], full = p + t;
      let n = 0;
      const type = () => {
        n += i === 0 ? 1 : 3;
        const cur = i === 0 ? full.slice(0, n) : full.slice(0, n);
        term.innerHTML = lines.slice(0, i).map(([pp, c, tt]) => `<span class="${c}">${pp}${tt}</span>`).join('\n')
          + (i ? '\n' : '') + `<span class="${lines[i][1]}">${cur}</span><span class="k">▍</span>`;
        if (n < full.length) setTimeout(type, i === 0 ? 45 : 12);
        else { i++; setTimeout(step, i === 1 ? 500 : 250); }
      };
      type();
    };
    setTimeout(step, 600);
  }

  // live GitHub stats (graceful fallback if offline / rate-limited)
  (async () => {
    const box = $('#gh-live');
    try {
      const r = await fetch('https://api.github.com/users/CHAITANYAMALINENI/repos?per_page=100&sort=pushed');
      if (!r.ok) throw 0;
      const repos = (await r.json()).filter(x => !x.fork);
      if (!repos.length) return;
      const langs = [...new Set(repos.map(x => x.language).filter(Boolean))];
      const last = new Date(repos[0].pushed_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
      box.innerHTML = `Live from GitHub: <b>${repos.length}</b> public repositories · languages: <b>${langs.join(', ')}</b> · last push <b>${last}</b> · <a class="link" href="https://github.com/CHAITANYAMALINENI" target="_blank" rel="noopener">see all →</a>`;
      box.hidden = false;
    } catch { /* keep hidden */ }
  })();
})();
