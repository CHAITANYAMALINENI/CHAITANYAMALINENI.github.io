(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const store = {
    get: k => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  };
  const root = document.documentElement;

  /* ---------- theme ---------- */
  $('#theme').addEventListener('click', () => {
    const dark = root.dataset.theme === 'dark' ||
      (!root.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
    root.dataset.theme = dark ? 'light' : 'dark';
    store.set('theme', root.dataset.theme);
  });

  /* ---------- nav: shadow, progress bar, scroll-spy ---------- */
  const nav = $('#nav'), bar = $('#progress');
  const onScroll = () => {
    nav.classList.toggle('scrolled', scrollY > 8);
    $$('.reveal:not(.in)').forEach(n => { if (n.getBoundingClientRect().top < innerHeight) n.classList.add('in'); });
    const h = document.documentElement.scrollHeight - innerHeight;
    bar.style.width = (h > 0 ? (scrollY / h) * 100 : 0) + '%';
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const links = $$('#menu a');
  const spy = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      links.forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + e.target.id));
    });
  }, { rootMargin: '-40% 0px -55% 0px' });
  links.forEach(a => { const t = $(a.getAttribute('href')); if (t) spy.observe(t); });

  $('#yr').textContent = new Date().getFullYear();

  /* ---------- copy email ---------- */
  const copyBtn = $('#copy-email'), copyLabel = $('#copy-label');
  copyBtn.addEventListener('click', async () => {
    const email = copyBtn.dataset.email;
    try { await navigator.clipboard.writeText(email); copyLabel.textContent = 'Copied ✓'; }
    catch { location.href = 'mailto:' + email; return; }
    setTimeout(() => (copyLabel.textContent = 'Copy email'), 1800);
  });

  /* ---------- reveal on scroll ---------- */
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { threshold: 0, rootMargin: '0px 0px -6% 0px' });
  $$('.reveal').forEach(el => io.observe(el));

  /* ---------- count-up metrics ---------- */
  if (!reduce) {
    const cio = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (!e.isIntersecting) return;
        cio.unobserve(e.target);
        const el = e.target, end = +el.dataset.count, suf = el.dataset.suffix || '';
        const t0 = performance.now(), dur = 1300;
        const tick = (t) => {
          const p = Math.min(1, (t - t0) / dur);
          el.textContent = Math.round(end * (1 - Math.pow(1 - p, 3))) + suf;
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    }, { threshold: 0.6 });
    $$('[data-count]').forEach(el => cio.observe(el));
  }

  /* ---------- live GitHub stats (hidden if unavailable) ---------- */
  (async () => {
    const box = $('#gh-live');
    try {
      const r = await fetch('https://api.github.com/users/CHAITANYAMALINENI/repos?per_page=100&sort=pushed');
      if (!r.ok) throw 0;
      const repos = (await r.json()).filter(x => !x.fork);
      if (!repos.length) return;
      const langs = [...new Set(repos.map(x => x.language).filter(Boolean))];
      const last = new Date(repos[0].pushed_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
      box.innerHTML = `Live from GitHub: <b>${repos.length}</b> public repositories · languages: <b>${langs.join(', ')}</b> · last push <b>${last}</b> · <a class="more" href="https://github.com/CHAITANYAMALINENI" target="_blank" rel="noopener">see all →</a>`;
      box.hidden = false;
    } catch { /* leave hidden */ }
  })();

  /* =====================================================================
     Event Flow Lab — a simplified model of an event-driven platform:
     producers -> broker -> consumers, with retry (exponential backoff +
     jitter), a dead-letter queue, and backward-compat vs breaking schemas.
     ===================================================================== */
  (function lab() {
    const cv = $('#labcanvas');
    if (!cv || !cv.getContext) return;
    const ctx = cv.getContext('2d');
    const W = 920, H = 330;
    const MAX_ATTEMPTS = 4, SVC_MS = 150, N_CONS = 3;

    const el = {
      rate: $('#rate'), rateOut: $('#rate-out'), fail: $('#fail'), breaking: $('#breaking'),
      burst: $('#burst'), replay: $('#replay'), reset: $('#reset'), pause: $('#pause'),
      tps: $('#s-tps'), q: $('#s-q'), r: $('#s-r'), d: $('#s-d'), ok: $('#s-ok'),
      health: $('#health'), healthText: $('#health-text'), note: $('#lab-note'), live: $('#lab-live'),
    };

    /* geometry (logical units) */
    const G = {
      prod: { x: 24, y: 95, w: 120, h: 140 },
      broker: { x: 260, y: 62, w: 190, h: 196 },
      retry: { x: 280, y: 272, w: 150, h: 48 },
      dlq: { x: 772, y: 105, w: 124, h: 120 },
      cons: [0, 1, 2].map(i => ({ x: 580, y: 38 + i * 97, w: 140, h: 58 })),
    };
    const mid = r => [r.x + r.w / 2, r.y + r.h / 2];

    /* state */
    let S, now = 0, running = !reduce, visible = false, last = 0, userPaused = reduce;
    const reset = () => {
      S = { queue: [], retry: [], dead: [], delivered: 0, deadTotal: 0, times: [], accum: 0, nextId: 1,
            cons: Array.from({ length: N_CONS }, () => ({ ev: null, until: 0, bad: false, flash: -1e9 })),
            parts: [] };
    };
    reset();

    const spawn = (x0, y0, x1, y1, color, dur) => {
      if (S.parts.length > 160) return;
      S.parts.push({ x0, y0, x1, y1, color, t0: now, dur });
    };
    const newEvent = () => ({ id: S.nextId++, attempts: 0, v: el.breaking.checked ? 2 : 1 });

    const produce = (n, animate) => {
      for (let i = 0; i < n; i++) {
        S.queue.push(newEvent());
        if (animate) {
          const [, py] = mid(G.prod);
          spawn(G.prod.x + G.prod.w, py + (Math.random() - .5) * 60, G.broker.x, mid(G.broker)[1] + (Math.random() - .5) * 60, 'accent', 380);
        }
      }
    };

    const shouldFail = (ev) =>
      (el.breaking.checked && ev.v === 2) || (el.fail.checked && Math.random() < 0.7);

    function step(dt) {
      now += dt;
      /* producers */
      S.accum += (+el.rate.value) * dt / 1000;
      const n = Math.floor(S.accum); S.accum -= n;
      if (n) produce(n, true);

      /* retry lane -> back to broker */
      for (let i = S.retry.length - 1; i >= 0; i--) {
        const r = S.retry[i];
        if (r.readyAt <= now) {
          S.retry.splice(i, 1); S.queue.push(r.ev);
          const [rx, ry] = mid(G.retry);
          spawn(rx, ry, mid(G.broker)[0], G.broker.y + G.broker.h - 30, 'warn', 320);
        }
      }

      /* consumers */
      S.cons.forEach((c, i) => {
        const [cx, cy] = mid(G.cons[i]);
        if (c.ev && now >= c.until) {
          const ev = c.ev; c.ev = null;
          if (!c.bad) {
            S.delivered++; S.times.push(now); c.flash = now;
          } else {
            ev.attempts++;
            if (ev.attempts >= MAX_ATTEMPTS) {
              S.dead.push(ev); S.deadTotal++;
              spawn(G.cons[i].x + G.cons[i].w, cy, G.dlq.x, mid(G.dlq)[1], 'bad', 380);
            } else {
              const backoff = 250 * Math.pow(2, ev.attempts - 1) + Math.random() * 150;
              S.retry.push({ ev, readyAt: now + backoff });
              const [rx, ry] = mid(G.retry);
              spawn(G.cons[i].x, cy, rx + 30, ry, 'warn', 480);
            }
          }
        }
        if (!c.ev && S.queue.length) {
          c.ev = S.queue.shift();
          c.bad = shouldFail(c.ev);
          c.until = now + SVC_MS * (0.7 + Math.random() * 0.6);
          spawn(G.broker.x + G.broker.w, mid(G.broker)[1], G.cons[i].x, cy, 'accent', 240);
        }
      });
      S.times = S.times.filter(t => now - t < 1000);
      S.parts = S.parts.filter(p => now - p.t0 < p.dur);
    }

    /* ---------- drawing ---------- */
    let C = {}, scale = 1;
    const readColors = () => {
      const cs = getComputedStyle(document.documentElement);
      const g = n => cs.getPropertyValue(n).trim();
      C = { bg: g('--bg'), surface: g('--surface'), ink: g('--ink'), muted: g('--muted'), line: g('--line'),
            accent: g('--accent'), good: g('--good'), warn: g('--warn'), bad: g('--bad'), alt: g('--bg-alt') };
    };
    const resize = () => {
      const r = cv.getBoundingClientRect(); if (!r.width) return;
      const dpr = Math.min(2, devicePixelRatio || 1);
      cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.width * H / W * dpr);
      scale = cv.width / W; readColors();
    };
    new ResizeObserver(resize).observe(cv);
    new MutationObserver(readColors).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', readColors);

    const rr = (x, y, w, h, r) => {
      ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    };
    const box = (r, stroke, fill) => { rr(r.x, r.y, r.w, r.h, 12); ctx.fillStyle = fill || C.surface; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = stroke || C.line; ctx.stroke(); };
    const text = (s, x, y, o = {}) => {
      ctx.font = `${o.w || 500} ${o.s || 12}px ${o.f || 'Inter, system-ui, sans-serif'}`;
      ctx.fillStyle = o.c || C.ink; ctx.textAlign = o.a || 'center'; ctx.textBaseline = 'middle'; ctx.fillText(s, x, y);
    };
    const line = (x0, y0, x1, y1, dash) => {
      ctx.beginPath(); ctx.setLineDash(dash || []); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
      ctx.strokeStyle = C.line; ctx.lineWidth = 1.5; ctx.stroke(); ctx.setLineDash([]);
    };
    const col = n => C[n] || n;

    function draw() {
      if (!C.bg) readColors();
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const mono = 'JetBrains Mono, ui-monospace, monospace';

      /* connectors */
      const [px, py] = mid(G.prod), [bx, by] = mid(G.broker);
      line(G.prod.x + G.prod.w, py, G.broker.x, by);
      G.cons.forEach((c, i) => {
        const [, cy] = mid(c);
        line(G.broker.x + G.broker.w, by, c.x, cy);
        line(c.x + c.w, cy, G.dlq.x, mid(G.dlq)[1], [4, 5]);
      });
      line(mid(G.retry)[0], G.retry.y, bx, G.broker.y + G.broker.h, [4, 5]);

      /* producers */
      box(G.prod);
      text('PRODUCERS', px, G.prod.y + 28, { s: 10.5, w: 600, c: C.muted, f: mono });
      text('services · APIs', px, G.prod.y + 52, { s: 12, c: C.ink });
      text(el.rate.value + ' ev/s', px, G.prod.y + 94, { s: 18, w: 600, c: C.accent, f: mono });
      if (el.breaking.checked) text('emitting v2', px, G.prod.y + 118, { s: 11, c: C.bad, f: mono });
      else text('schema v1', px, G.prod.y + 118, { s: 11, c: C.muted, f: mono });

      /* broker */
      const qn = S.queue.length;
      const lagging = qn > 60;
      box(G.broker, lagging ? col('warn') : C.accent, C.surface);
      text('MESSAGE BROKER', bx, G.broker.y + 24, { s: 10.5, w: 600, c: C.muted, f: mono });
      text('multi-region · HA queues', bx, G.broker.y + 44, { s: 11.5 });
      const cols = 10, cell = 15, gx = G.broker.x + (G.broker.w - cols * cell) / 2 + 2, gy = G.broker.y + 66;
      const shown = Math.min(qn, 50);
      for (let i = 0; i < 50; i++) {
        const x = gx + (i % cols) * cell, y = gy + Math.floor(i / cols) * cell;
        rr(x, y, 11, 11, 3); ctx.fillStyle = i < shown ? (lagging ? C.warn : C.accent) : C.alt; ctx.fill();
      }
      text(qn > 50 ? `+${qn - 50} more queued` : `queue depth ${qn}`, bx, G.broker.y + G.broker.h - 26, { s: 11, c: lagging ? C.warn : C.muted, f: mono });
      text(`lag ${(qn / 20).toFixed(1)}s`, bx, G.broker.y + G.broker.h - 10, { s: 10, c: C.muted, f: mono });

      /* retry */
      const rn = S.retry.length;
      box(G.retry, rn ? col('warn') : C.line);
      text(`RETRY · backoff`, G.retry.x + 12, G.retry.y + 14, { s: 10, w: 600, c: C.muted, f: mono, a: 'left' });
      text(`${rn} waiting`, G.retry.x + 12, G.retry.y + 33, { s: 12, w: 600, c: rn ? C.warn : C.ink, f: mono, a: 'left' });
      for (let i = 0; i < Math.min(rn, 6); i++) { ctx.beginPath(); ctx.arc(G.retry.x + G.retry.w - 14 - i * 10, G.retry.y + 33, 3.5, 0, 7); ctx.fillStyle = C.warn; ctx.fill(); }

      /* consumers */
      G.cons.forEach((r, i) => {
        const c = S.cons[i], busy = !!c.ev;
        const flashing = now - c.flash < 180;
        box(r, busy ? (c.bad ? col('warn') : C.accent) : (flashing ? C.good : C.line));
        text(`CONSUMER ${i + 1}`, r.x + 12, r.y + 16, { s: 10, w: 600, c: C.muted, f: mono, a: 'left' });
        text(busy ? (c.bad ? 'failing…' : 'processing') : 'idle', r.x + 12, r.y + 36, { s: 12, c: busy ? (c.bad ? C.warn : C.accent) : C.muted, a: 'left' });
        if (busy) {
          const p = Math.max(0, Math.min(1, 1 - (c.until - now) / SVC_MS));
          rr(r.x + 12, r.y + r.h - 9, r.w - 24, 3, 2); ctx.fillStyle = C.alt; ctx.fill();
          rr(r.x + 12, r.y + r.h - 9, (r.w - 24) * p, 3, 2); ctx.fillStyle = c.bad ? C.warn : C.accent; ctx.fill();
        }
      });

      /* DLQ */
      const dn = S.dead.length;
      box(G.dlq, dn ? col('bad') : C.line, dn ? C.surface : C.surface);
      const [dx] = mid(G.dlq);
      text('DEAD-LETTER', dx, G.dlq.y + 24, { s: 10.5, w: 600, c: C.muted, f: mono });
      text('QUEUE', dx, G.dlq.y + 38, { s: 10.5, w: 600, c: C.muted, f: mono });
      text(String(dn), dx, G.dlq.y + 74, { s: 30, w: 600, c: dn ? C.bad : C.ink, f: 'Fraunces, Georgia, serif' });
      text(dn ? 'inspect · replay' : 'empty', dx, G.dlq.y + 102, { s: 10.5, c: dn ? C.bad : C.muted, f: mono });

      /* particles */
      S.parts.forEach(p => {
        const t = Math.min(1, (now - p.t0) / p.dur), e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        const x = p.x0 + (p.x1 - p.x0) * e, y = p.y0 + (p.y1 - p.y0) * e;
        ctx.beginPath(); ctx.arc(x, y, 4, 0, 7); ctx.fillStyle = col(p.color); ctx.globalAlpha = 1 - t * .35; ctx.fill(); ctx.globalAlpha = 1;
      });
    }

    /* ---------- stats / health / narration ---------- */
    let lastUi = 0;
    function ui(force) {
      if (!force && performance.now() - lastUi < 200) return;
      lastUi = performance.now();
      const qn = S.queue.length, rn = S.retry.length, dn = S.dead.length;
      const denom = S.delivered + S.deadTotal;
      el.tps.textContent = S.times.length;
      el.q.textContent = qn; el.r.textContent = rn; el.d.textContent = dn;
      el.ok.textContent = denom ? Math.round(S.delivered / denom * 1000) / 10 + '%' : '100%';

      let state = 'ok', txt = 'Healthy', note = 'Steady state: producers publish, consumers acknowledge, nothing is lost.';
      if (dn) {
        state = 'bad'; txt = `ALERT · ${dn} dead-lettered`;
        note = el.breaking.checked
          ? 'Breaking change: consumers can’t read v2 events. They retry with backoff, then land in the dead-letter queue and alert. Turn the toggle off (compatible schema) and replay — nothing is lost.'
          : 'Failed messages are isolated in the dead-letter queue and an alert fires. Fix the cause, then replay them — no data lost, no blocked queue.';
      } else if (rn || el.fail.checked) {
        state = 'warn'; txt = 'Degraded · retrying';
        note = 'Downstream is flaky: failed events retry with exponential backoff and jitter instead of being dropped or hammering the dependency.';
      } else if (qn > 60) {
        state = 'warn'; txt = 'Lagging';
        note = 'Traffic exceeds consumer capacity, so queue depth (lag) climbs. This is the signal that drives alerts and scale-out.';
      } else if (el.breaking.checked) {
        state = 'warn'; txt = 'Risky deploy';
        note = 'A breaking schema change is live: v2 events can’t be consumed yet. Watch what happens.';
      }
      el.health.className = 'health' + (state === 'ok' ? '' : ' ' + state);
      el.healthText.textContent = txt;
      if (el.note.textContent !== note) el.note.textContent = note;
    }

    /* ---------- loop ---------- */
    function frame(t) {
      requestAnimationFrame(frame);
      if (!visible) { last = t; return; }
      const dt = Math.min(60, t - last || 16); last = t;
      if (running) step(dt);
      draw(); ui();
    }
    requestAnimationFrame(frame);
    new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible) resize(); }, { threshold: 0.05 }).observe(cv);

    /* ---------- controls ---------- */
    el.rate.addEventListener('input', () => (el.rateOut.textContent = el.rate.value));
    el.burst.addEventListener('click', () => { produce(150, false); for (let i = 0; i < 14; i++) spawn(G.prod.x + G.prod.w, mid(G.prod)[1] + (Math.random() - .5) * 80, G.broker.x, mid(G.broker)[1], 'accent', 380 + i * 25); ui(true); });
    el.replay.addEventListener('click', () => {
      const n = S.dead.length; if (!n) return;
      S.dead.forEach(ev => { ev.attempts = 0; S.queue.push(ev); });
      for (let i = 0; i < Math.min(n, 12); i++) spawn(mid(G.dlq)[0], mid(G.dlq)[1], G.broker.x + G.broker.w, mid(G.broker)[1], 'good', 400 + i * 30);
      S.dead = []; ui(true);
    });
    el.reset.addEventListener('click', () => { reset(); el.fail.checked = false; el.breaking.checked = false; ui(true); });
    const setPaused = (p) => { userPaused = p; running = !p; el.pause.textContent = p ? 'Resume' : 'Pause'; el.pause.setAttribute('aria-pressed', String(p)); };
    el.pause.addEventListener('click', () => setPaused(!userPaused));
    setPaused(userPaused);
    [el.fail, el.breaking].forEach(c => c.addEventListener('change', () => ui(true)));

    /* screen-reader summary, throttled */
    setInterval(() => {
      if (!visible || !running) return;
      el.live.textContent = `${S.times.length} events per second processed, queue depth ${S.queue.length}, ${S.retry.length} retrying, ${S.dead.length} dead-lettered.`;
    }, 4000);

    resize(); draw(); ui(true);
  })();
})();
