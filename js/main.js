import { World, THREE, gsap, isMobile, reduceMotion } from './world.js';
import { composeDeck, CATS, esc, docCard } from './slides.js';
import { W, DEEP } from './workflows.js';
import { pauseAllVideos } from './graph.js';

const SP = 110;          // slide spacing inside a station
const GAP = 240;         // empty arc between stations
const R = 900;           // helix radius
const $ = s => document.querySelector(s);
const bootS = $('#boot-s');

async function boot() {
  if (!window.WebGL2RenderingContext && !window.WebGLRenderingContext) throw new Error('WebGL');
  bootS.textContent = '기록을 불러오는 중';
  const [A] = await Promise.all([
    fetch('data/archive.json').then(r => r.json()),
    document.fonts.load('650 40px "Pretendard Variable"').catch(() => {}),
    document.fonts.load('400 20px "JetBrains Mono"').catch(() => {}),
  ]);
  await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 2500))]);
  // 프로젝트별 실제 화면 매니페스트 (없으면 건너뜀)
  const SHOTS = {};
  await Promise.all(DEEP.map(id => fetch(`data/shots/${id}.json`).then(r => (r.ok ? r.json() : null)).then(j => { if (j?.shots?.length) SHOTS[id] = j.shots; }).catch(() => {})));
  bootS.textContent = '공간을 만드는 중';
  const world = new World($('#gl'), $('#labels'));
  const deck = new Deck(world, composeDeck(A, SHOTS));
  deck.start();
  world.start();
  setTimeout(() => $('#boot').classList.add('done'), 350);
}

class Deck {
  constructor(world, { slides, stations, chapters, ctx }) {
    this.world = world;
    this.slides = slides;
    this.stations = stations;
    this.chapters = chapters;
    this.ctx = ctx;
    this.cur = -1;
    this.step = 0;
    this.layoutStations();
    this.bindUI();
    this.buildOverview();
    world.onTick((t, dt) => this.slides.forEach(s => s.api && s.anchor.visible !== false && s.api.update?.(t, dt)));
    world.onHoverAny = obj => this.tip(obj?.userData.tip);
    addEventListener('resize', () => this.refit());
  }

  /* ---------- world layout: stations on a descending helix ---------- */
  layoutStations() {
    let arc = 0, prevHalf = 0;
    this.stations.forEach((st, k) => {
      const n = st.slides.length;
      const half = (n - 1) * SP / 2 + 60;
      arc += k ? prevHalf + half + GAP : 0;
      prevHalf = half;
      const a = arc / R;
      const g = new THREE.Group();
      g.position.set(Math.sin(a) * R, -k * 48, Math.cos(a) * R);
      g.rotation.y = a;
      this.world.scene.add(g);
      st.group = g;
      st.slides.forEach((s, j) => {
        const anchor = new THREE.Group();
        anchor.position.x = (j - (n - 1) / 2) * SP;
        g.add(anchor);
        s.anchor = anchor;
      });
      g.updateMatrixWorld(true);
    });
  }

  ensureBuilt(i) {
    const s = this.slides[i];
    if (!s || s.api) return;
    s.api = s.build(this.ctx, this) || {};
    if (s.api.group) s.anchor.add(s.api.group);
    s.anchor.updateMatrixWorld(true);
    const fit = s.api.fit || s.view.fit || { w: 40, h: 30 };
    this.world.add(s.anchor, { radius: Math.max(fit.w, fit.h) * .8 + 220 });
  }

  /* ---------- camera ---------- */
  pose(s) {
    const v = s.view;
    const ov = s.api?.view?.(this.step);
    const fit = ov?.fit || s.api?.fit || v.fit || { w: 40, h: 30 };
    const mobile = isMobile();
    let fx, fy, focus;
    if (s.layout === 'left' && s.type !== 'evidence') {
      const narrow = ['arch', 'loop', 'sys', 'model', 'title', 'screens'].includes(s.type);
      if (mobile) { fx = .96; fy = .4; focus = [0, -.25]; } else if (narrow) { fx = .6; fy = .8; focus = [.19, 0]; } else { fx = .5; fy = .78; focus = [.22, 0]; }
    } else if (s.layout === 'center') { fx = .86; fy = mobile ? .42 : .6; focus = [0, mobile ? -.08 : 0]; }
    else { fx = .9; fy = .8; focus = [0, 0]; }
    const fov = 40, tn = Math.tan(THREE.MathUtils.degToRad(fov / 2)), asp = innerWidth / innerHeight;
    const d = Math.max(fit.w / 2 / (tn * asp * fx), fit.h / 2 / (tn * fy)) * (v.far || 1);
    const target = ov ? new THREE.Vector3(...ov.target) : s.type === 'evidence' ? new THREE.Vector3(-s.anchor.position.x, 0, 0) : new THREE.Vector3(...(v.target || [0, 0, 0]));
    const dir = new THREE.Vector3(...(ov?.dir || v.dir)).normalize();
    const pos = target.clone().addScaledVector(dir, Math.min(d, 420));
    return { pos: s.anchor.localToWorld(pos), target: s.anchor.localToWorld(target), focus, fov };
  }

  refit() {
    const s = this.slides[this.cur];
    if (!s) return;
    const p = this.pose(s);
    this.world.flyTo(p.pos, p.target, { duration: .8, fov: p.fov });
    this.world.setFocus(...p.focus, true);
  }

  /* ---------- navigation ---------- */
  start() {
    const idx = this.indexFromHash();
    const first = this.slides[idx];
    // dramatic entry: start far above the first station
    for (let i = Math.max(0, idx - 1); i <= idx + 2; i++) this.ensureBuilt(i);
    const p = this.pose(first);
    this.world.flyTo(p.pos.clone().add(new THREE.Vector3(0, 160, 0)).addScaledVector(p.pos.clone().sub(p.target).normalize(), 380), p.target, { instant: true });
    this.go(idx, 0, { first: true });
    addEventListener('hashchange', () => {
      const i = this.indexFromHash();
      if (i !== this.cur && !this._hashLock) this.go(i, 0);
    });
  }

  indexFromHash() {
    const id = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
    const i = this.slides.findIndex(s => s.id === id);
    return i < 0 ? 0 : i;
  }

  go(i, step = 0, opts = {}) {
    i = Math.max(0, Math.min(this.slides.length - 1, i));
    const prev = this.slides[this.cur];
    const s = this.slides[i];
    if (prev && prev !== s) { prev.api?.leave?.(); pauseAllVideos(); }
    this.closeInspector();
    this.tip(null);
    // build this station + neighbours
    s.station.slides.forEach(x => this.ensureBuilt(x.index));
    for (let k = i - 1; k <= i + 2; k++) this.ensureBuilt(k);
    const same = prev === s;
    this.cur = i;
    this.step = Math.max(0, Math.min(s.steps || 0, step === -1 ? (s.steps || 0) : step));
    const p = this.pose(s);
    if (!same) {
      this.world.flyTo(p.pos, p.target, { fov: p.fov, duration: opts.first ? 3.2 : 2.2, arc: prev && prev.station !== s.station ? 0 : 6 });
      this.world.setFocus(...p.focus, opts.first);
      this.renderHTML(s);
      this.world.pickables = s.api?.pickables || [];
      setTimeout(() => { if (this.cur === i) s.api?.enter?.(); }, opts.first ? 1400 : 700);
    }
    this.setStep(this.step, true);
    this.updateHUD();
    this._hashLock = true;
    history.replaceState(null, '', '#/' + s.id);
    setTimeout(() => (this._hashLock = false), 50);
  }

  setStep(k, fromGo) {
    const s = this.slides[this.cur];
    const prevStep = this.step;
    this.step = Math.max(0, Math.min(s.steps || 0, k));
    if (!fromGo && s.api?.view && prevStep !== this.step) {
      const p = this.pose(s);
      this.world.flyTo(p.pos, p.target, { fov: p.fov, duration: 1.4 });
    }
    const el = this.el;
    if (el) {
      el.querySelectorAll('.steps li').forEach((li, j) => {
        li.classList.toggle('on', j === this.step - 1);
        li.classList.toggle('done', j < this.step - 1);
      });
      el.querySelector('.steps li.on')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      s.onStep?.(el, this.step);
    }
    s.api?.step?.(this.step);
    this.updateHUD();
  }

  next(skip) {
    const s = this.slides[this.cur];
    if (!skip && this.step < (s.steps || 0)) return this.setStep(this.step + 1);
    if (this.cur < this.slides.length - 1) this.go(this.cur + 1, 0);
  }

  prev(skip) {
    if (!skip && this.step > 0) return this.setStep(this.step - 1);
    if (this.cur > 0) this.go(this.cur - 1, skip ? 0 : -1);
  }

  goId(id) {
    const i = this.slides.findIndex(s => s.id === id);
    if (i >= 0) this.go(i);
  }

  /* ---------- HTML layer ---------- */
  renderHTML(s) {
    const stage = $('#stage');
    const old = this.el;
    if (old) { old.classList.remove('in'); old.classList.add('out'); setTimeout(() => old.remove(), 380); }
    const el = document.createElement('section');
    el.className = `slide ${s.layout} ${s.cls || ''}`;
    el.dataset.type = s.type;
    el.setAttribute('aria-label', s.title);
    el.innerHTML = s.html();
    stage.appendChild(el);
    this.el = el;
    document.body.dataset.layout = s.layout;
    document.body.dataset.type = s.type;
    document.documentElement.style.setProperty('--hue', s.hue);
    s.mount?.(el, s.api, this);
    el.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => this.openProject(b.dataset.open)));
    el.querySelectorAll('[data-go-to]').forEach(b => b.addEventListener('click', () => (b.dataset.goTo === '0' ? this.go(0) : this.goId(b.dataset.goTo))));
    el.querySelectorAll('.steps li').forEach((li, j) => li.addEventListener('click', () => this.setStep(j + 1)));
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('in')));
    // count-up numbers
    el.querySelectorAll('[data-count]').forEach(b => {
      const to = +b.dataset.count, o = { v: 0 };
      gsap.to(o, { v: to, duration: reduceMotion ? 0 : 1.6, delay: .3, ease: 'power2.out', onUpdate: () => (b.textContent = Math.round(o.v).toLocaleString('ko-KR')) });
    });
    this.renderNotes();
  }

  updateHUD() {
    const s = this.slides[this.cur];
    $('.crumb-ch').textContent = `${s.chapter.no} ${s.chapter.en}`;
    $('.crumb-sl').textContent = s.title + (s.steps ? ` · ${this.step}/${s.steps}` : '');
    $('#cnt-now').textContent = String(this.cur + 1).padStart(2, '0');
    $('#cnt-all').textContent = String(this.slides.length).padStart(2, '0');
    const frac = (this.cur + (s.steps ? this.step / (s.steps + 1) : 0)) / (this.slides.length - 1);
    $('#progress i').style.width = (frac * 100).toFixed(2) + '%';
    document.querySelectorAll('.ov-row button').forEach(b => b.classList.toggle('cur', +b.dataset.i === this.cur));
  }

  /* ---------- overlays ---------- */
  buildOverview() {
    const grid = $('.ov-grid');
    const prog = $('#progress');
    let last = null, html = '';
    this.slides.forEach((s, i) => {
      if (s.chapter !== last) {
        if (last) html += '</div></div>';
        html += `<div class="ov-ch" style="--c:${s.chapter.color}"><h3>${s.chapter.no} · ${esc(s.chapter.en)} — ${esc(s.chapter.ko)}</h3><div class="ov-row">`;
        last = s.chapter;
        const tick = document.createElement('span');
        tick.className = 'tick';
        tick.style.left = (i / (this.slides.length - 1) * 100) + '%';
        prog.appendChild(tick);
      }
      html += `<button type="button" data-i="${i}"><small>${String(i + 1).padStart(2, '0')}</small>${esc(s.title)}</button>`;
    });
    grid.innerHTML = html + '</div></div>';
    grid.addEventListener('click', e => {
      const b = e.target.closest('[data-i]');
      if (!b) return;
      this.toggleOverview(false);
      this.go(+b.dataset.i);
    });
  }

  toggleOverview(on = !$('#overview').classList.contains('on')) {
    $('#overview').classList.toggle('on', on);
    $('#overview').setAttribute('aria-hidden', !on);
    document.querySelector('[data-action="overview"]').setAttribute('aria-pressed', on);
    if (on) document.querySelector('.ov-row button.cur')?.scrollIntoView({ block: 'center' });
  }

  renderNotes() {
    const s = this.slides[this.cur];
    $('.notes-body').innerHTML = `<ul>${(s.notes || []).map(n => `<li>${esc(n)}</li>`).join('')}</ul>`;
  }

  toggleNotes(on = !$('#notes').classList.contains('on')) {
    $('#notes').classList.toggle('on', on);
    $('#notes').setAttribute('aria-hidden', !on);
    document.querySelector('[data-action="notes"]').setAttribute('aria-pressed', on);
    this.startTimer();
  }

  startTimer() {
    if (this.timer) return;
    const t0 = Date.now();
    this.timer = setInterval(() => {
      const s = Math.floor((Date.now() - t0) / 1000);
      $('#timer').textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    }, 1000);
  }

  togglePresent() {
    const on = !document.body.classList.contains('present');
    document.body.classList.toggle('present', on);
    document.querySelector('[data-action="present"]').setAttribute('aria-pressed', on);
    if (on && !document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
    if (!on && document.fullscreenElement) document.exitFullscreen?.();
    this.startTimer();
  }

  tip(t) {
    const el = $('#tip');
    if (!t) { el.classList.remove('on'); return; }
    el.innerHTML = `<b>${esc(t.label || t.title || '')}</b>${t.path ? `<code>${esc(t.path)}</code>` : ''}${t.desc ? esc(t.desc) : ''}`;
    el.classList.add('on');
    this.placeTip();
  }

  placeTip() {
    const el = $('#tip');
    const [x, y] = this.world.pointerPx || [0, 0];
    const w = el.offsetWidth, h = el.offsetHeight;
    el.style.left = Math.min(innerWidth - w - 12, x + 16) + 'px';
    el.style.top = Math.min(innerHeight - h - 12, y + 16) + 'px';
  }

  /* ---------- inspector ---------- */
  openInspector(html, color) {
    const ins = $('#inspector');
    ins.style.setProperty('--c', color || 'var(--accent)');
    ins.querySelector('.ins-body').innerHTML = html;
    ins.classList.add('on');
    ins.setAttribute('aria-hidden', 'false');
    ins.querySelector('.ins-body').scrollTop = 0;
    ins.querySelectorAll('img[data-media]').forEach(img => img.addEventListener('click', () => this.lightbox(this.ctx.media[img.dataset.media])));
    ins.querySelectorAll('[data-go-to]').forEach(b => b.addEventListener('click', () => this.goId(b.dataset.goTo)));
  }

  closeInspector() {
    $('#inspector').classList.remove('on');
    $('#inspector').setAttribute('aria-hidden', 'true');
    const s = this.slides[this.cur];
    if (s?.type === 'arch') this.step ? s.api?.graph?.focusFlow(this.step - 1) : s.api?.graph?.reset();
  }

  openProject(id) {
    const p = this.ctx.P[id];
    if (!p) return;
    if (W[id]) return this.goId(id);
    const c = CATS[p.category];
    const m = this.ctx.media[p.media?.[0]];
    const doc = p.documents.map(d => this.ctx.docs[d]).find(Boolean);
    const gal = p.media.map(x => this.ctx.media[x]).filter(Boolean);
    this.openInspector(`
      <div class="eyebrow" style="--hue:${c.color}">${String(p.index).padStart(2, '0')} · ${esc(c.en)} · ${esc(p.stack.join(' · '))}</div>
      <h3>${esc(p.title)}</h3>
      <p style="color:var(--dim);font-family:var(--display)">${esc(p.subtitle)}</p>
      ${m ? `<img src="${m.src}" alt="${esc(m.title)}" data-media="${m.id}">` : ''}
      ${gal.length > 1 ? `<div class="strip">${gal.slice(1).map(g => `<button type="button"><img src="${g.src}" alt="" data-media="${g.id}" style="width:118px;height:70px;object-fit:cover"><span>${esc(g.title)}</span></button>`).join('')}</div>` : ''}
      <p>${esc(p.description)}</p>
      <div class="ba"><div><b>BEFORE</b><p>${esc(p.before)}</p></div><div><b>AFTER</b><p>${esc(p.after)}</p></div></div>
      <ul class="tl" style="--c:${c.color}">${p.events.map(e => `<li class="${e.type}"><time>${e.date || '날짜 미상'} · ${esc(e.type)}</time><b>${esc(e.title)}</b>${esc(e.body)}<small>${esc(e.source)}</small></li>`).join('')}</ul>
      ${doc ? docCard(doc) : ''}
      <div class="limits">${esc(p.limitation)}</div>`, c.color);
  }

  inspectModule(p, m) {
    const a = W[p.id].arch;
    const name = id => a.modules.find(x => x.id === id)?.label || id;
    const out = a.flows.filter(f => f.from === m.id), inn = a.flows.filter(f => f.to === m.id);
    const s = this.slides[this.cur];
    if (s.type === 'arch') s.api?.graph?.focusNode(m.id);
    const c = CATS[p.category].color;
    this.openInspector(`
      <div class="eyebrow" style="--hue:${c}">${esc(p.title)} · module</div>
      <h3>${esc(m.label)}</h3>
      <code class="mono" style="color:${c};font-size:12px;word-break:break-all">${esc(m.path)}</code>
      <p>${esc(m.desc)}</p>
      ${inn.length ? `<div class="doc"><div class="doc-head"><span>IN · 들어오는 흐름</span><span>${inn.length}</span></div><pre>${inn.map(f => `<span style="color:${c}">${esc(name(f.from))}</span> → ${esc(f.label)}\n  ${esc(f.desc || '')}`).join('\n\n')}</pre></div>` : ''}
      ${out.length ? `<div class="doc"><div class="doc-head"><span>OUT · 나가는 흐름</span><span>${out.length}</span></div><pre>${out.map(f => `${esc(f.label)} → <span style="color:${c}">${esc(name(f.to))}</span>\n  ${esc(f.desc || '')}`).join('\n\n')}</pre></div>` : ''}`, c);
  }

  lightbox(m) {
    if (!m) return;
    const lb = $('#lightbox');
    lb.querySelector('img').src = m.src;
    lb.querySelector('img').alt = m.title;
    lb.querySelector('figcaption').innerHTML = `${esc(m.title)}<small>${esc(m.version || '')} · ${m.width}×${m.height} · ${esc(m.source || '')}</small>${m.note ? `<small>${esc(m.note)}</small>` : ''}`;
    lb.classList.add('on');
    lb.setAttribute('aria-hidden', 'false');
  }

  /* ---------- input ---------- */
  bindUI() {
    document.addEventListener('click', e => {
      const a = e.target.closest('[data-action]');
      if (!a) return;
      const act = a.dataset.action;
      if (act === 'next') this.next();
      else if (act === 'prev') this.prev();
      else if (act === 'overview') this.toggleOverview();
      else if (act === 'notes') this.toggleNotes();
      else if (act === 'present') this.togglePresent();
      else if (act === 'close-inspector') this.closeInspector();
      else if (act === 'close-lightbox') $('#lightbox').classList.remove('on');
    });
    $('.brand').addEventListener('click', e => { e.preventDefault(); this.go(0); });
    $('#lightbox').addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.classList.remove('on'); });
    addEventListener('orbit:lightbox', e => this.lightbox(e.detail));
    addEventListener('pointermove', () => $('#tip').classList.contains('on') && this.placeTip());
    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement && document.body.classList.contains('present')) {
        document.body.classList.remove('present');
        document.querySelector('[data-action="present"]').setAttribute('aria-pressed', false);
      }
    });

    addEventListener('keydown', e => {
      if (e.target.matches('input, textarea')) { if (e.key === 'Escape') e.target.blur(); return; }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key;
      const ovOn = $('#overview').classList.contains('on');
      if (k === 'Escape') {
        if ($('#lightbox').classList.contains('on')) return $('#lightbox').classList.remove('on');
        if (ovOn) return this.toggleOverview(false);
        if ($('#inspector').classList.contains('on')) return this.closeInspector();
        if ($('#blackout').classList.contains('on')) return $('#blackout').classList.remove('on');
        return this.toggleOverview(true);
      }
      if (ovOn) return;
      if (['ArrowRight', 'ArrowDown', ' ', 'Enter'].includes(k)) { e.preventDefault(); this.next(e.shiftKey); }
      else if (k === 'PageDown') { e.preventDefault(); this.next(true); }
      else if (['ArrowLeft', 'ArrowUp', 'Backspace'].includes(k)) { e.preventDefault(); this.prev(e.shiftKey); }
      else if (k === 'PageUp') { e.preventDefault(); this.prev(true); }
      else if (k === 'Home') this.go(0);
      else if (k === 'End') this.go(this.slides.length - 1);
      else if (k === 'g' || k === 'G') this.toggleOverview();
      else if (k === 'n' || k === 'N') this.toggleNotes();
      else if (k === 'p' || k === 'P' || k === 'F5') { e.preventDefault(); this.togglePresent(); }
      else if (k === 'b' || k === 'B' || k === '.') $('#blackout').classList.toggle('on');
      else if (k === 'r' || k === 'R') this.world.resetLook();
    });

    // wheel → step / slide (ignored over scrollable panels)
    let acc = 0, lock = 0;
    addEventListener('wheel', e => {
      if (e.ctrlKey || e.altKey) return;
      if ($('#overview').classList.contains('on') || $('#lightbox').classList.contains('on')) return;
      const sc = e.target.closest('.cards, .steps, .doc pre, .strip, .ins-body, .modlist, .inspector, .slide.has-evi');
      if (sc && sc.scrollHeight > sc.clientHeight + 2) {
        const atTop = sc.scrollTop <= 0, atEnd = sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 2;
        if ((e.deltaY < 0 && !atTop) || (e.deltaY > 0 && !atEnd)) return;
        if (sc.closest('.inspector')) return;
      }
      const now = performance.now();
      if (now < lock) return;
      acc += e.deltaY;
      if (Math.abs(acc) > 42) {
        acc > 0 ? this.next() : this.prev();
        acc = 0;
        lock = now + (this.slides[this.cur].steps ? 420 : 900);
      }
    }, { passive: true });

    // touch swipe
    let ts = null;
    addEventListener('touchstart', e => { if (e.touches.length === 1) ts = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now(), el: e.target }; }, { passive: true });
    addEventListener('touchend', e => {
      if (!ts) return;
      const t = e.changedTouches[0], dx = t.clientX - ts.x, dy = t.clientY - ts.y;
      const el = ts.el;
      ts = null;
      if (el.closest('.cards, .steps, .doc pre, .strip, .inspector, .overview, .cmp, .modlist, .slide.has-evi')) {
        if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      }
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 50) return;
      const fwd = Math.abs(dx) > Math.abs(dy) ? dx < 0 : dy < 0;
      fwd ? this.next() : this.prev();
    }, { passive: true });
  }
}

boot().catch(err => {
  console.error(err);
  bootS.textContent = err.message === 'WebGL' ? '이 브라우저는 WebGL을 지원하지 않습니다.' : '불러오지 못했습니다. 로컬 서버로 열어주세요 (npm start).';
});
