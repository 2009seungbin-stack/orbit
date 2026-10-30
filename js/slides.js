import { THREE, gsap, label, loadTex } from './world.js';
import { makeNode, buildGraph, buildRing, imagePlane, orbitRings, cardTexture, screenSwap, mediaTexture } from './graph.js';
import { W } from './workflows.js';

export const CATS = {
  worlds: { en: 'Worlds', ko: '게임 · 세계', color: '#ff9f43' },
  intelligence: { en: 'Intelligence', ko: 'AI · 로보틱스', color: '#a78bfa' },
  systems: { en: 'Systems', ko: '도구 · 서비스', color: '#38bdf8' },
  motion: { en: 'Motion', ko: '영상 · 제작', color: '#fb7185' },
  stories: { en: 'Stories', ko: '글 · 서사', color: '#fcd34d' },
  lab: { en: 'Lab', ko: '실험 · 탐구', color: '#34d399' },
};
const LIME = '#d4ff3a';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const md = d => (d ? d.slice(5).replace('-', '.') : '날짜 미상');
const nf = n => Number(n).toLocaleString('ko-KR');
const V = (x, y, z) => new THREE.Vector3(x, y, z);

/* =========================================================
   Deck composition
   ========================================================= */
export function composeDeck(A, SHOTS = {}) {
  const P = Object.fromEntries(A.projects.map(p => [p.id, p]));
  const media = Object.fromEntries(A.proof.media.map(m => [m.id, m]));
  const docs = Object.fromEntries(A.proof.documents.map(d => [d.id, d]));
  const cases = Object.fromEntries(A.cases.map(c => [c.project, c]));
  const models = A.proof.models;
  const clips = A.proof.clips;
  // 아카이브에 이미 있던 시각 자료도 실제 화면 목록에 합칩니다 (같은 원본은 한 번만)
  A.projects.forEach(p => {
    const own = SHOTS[p.id] || [];
    const seen = own.map(x => (x.source || '').replace(/\\/g, '/'));
    const old = p.media.map(id => media[id]).filter(Boolean)
      .filter(m => !seen.some(s => s && (m.source.endsWith(s) || s.endsWith(m.source))))
      .map(m => ({ id: m.id, src: m.src, kind: m.kind === 'chart' ? 'chart' : 'capture', title: m.title, caption: m.note || `${m.version} · ${m.title}`, date: m.date, version: m.version, stage: null, module: null, width: m.width, height: m.height, source: m.source }));
    if (own.length || old.length) SHOTS[p.id] = [...own, ...old];
  });
  clips.forEach(c => (SHOTS[c.project] ||= []).some(x => x.src === c.src || x.kind === 'video') || SHOTS[c.project].unshift({ id: c.id, src: c.src, poster: c.poster, kind: 'video', title: c.title, caption: c.note, date: c.date, version: c.version, stage: null, module: null, width: 1280, height: 720, source: c.source }));
  const ctx = { A, P, media, docs, cases, models, clips, shots: SHOTS };

  const chapters = [
    { id: 'intro', no: '00', en: 'Orbit', ko: '시작', color: LIME },
    { id: 'method', no: '01', en: 'Method', ko: '일하는 방식', color: LIME },
    { id: 'worlds', no: '02', en: 'Worlds', ko: '게임과 세계', color: CATS.worlds.color, cat: 'worlds', deep: ['vesna', 'lastlight', 'pets'], more: ['horror', 'blackfire', 'rig', 'spatial'] },
    { id: 'intelligence', no: '03', en: 'Intelligence', ko: 'AI와 로봇', color: CATS.intelligence.color, cat: 'intelligence', deep: ['go2', 'gauntlet', 'jarvis', 'claudelocal'], more: ['thermal'] },
    { id: 'systems', no: '04', en: 'Systems', ko: '도구와 서비스', color: CATS.systems.color, cat: 'systems', deep: ['nerulio', 'learn'], more: ['hanmadi', 'study', 'saup', 'jobs', 'geto'] },
    { id: 'motion', no: '05', en: 'Motion & Stories', ko: '영상과 글', color: CATS.motion.color, cat: 'motion', deep: ['shorts', 'novel'], more: ['sangse', 'profiles', 'ultra', 'ranklab', 'minecraft'] },
    { id: 'archive', no: '06', en: 'Archive', ko: '전체 기록', color: LIME },
  ];

  const stations = [];
  const station = (chapter, key) => { const s = { key, chapter, slides: [] }; stations.push(s); return s; };
  const add = (st, slide) => { slide.station = st; slide.chapter = st.chapter; slide.j = st.slides.length; slide.hue ||= st.chapter.color; st.slides.push(slide); return slide; };

  // ---- intro
  let st = station(chapters[0], 'intro');
  add(st, slideTitle(ctx));
  add(st, slideNumbers(ctx));
  add(st, slideUniverse(ctx));
  // ---- method
  st = station(chapters[1], 'method');
  add(st, slideMethod(ctx));
  add(st, slideEvidencePrinciple(ctx));
  // ---- project chapters
  for (const ch of chapters.slice(2, 6)) {
    st = station(ch, ch.id);
    add(st, slideChapter(ctx, ch));
    ch.deep.forEach((id, k) => {
      const p = P[id];
      const hue = CATS[p.category].color;
      const ps = station(ch, id);
      const tag = `${ch.no}.${k + 1}`;
      add(ps, { ...slideCover(ctx, p, tag), hue });
      if ((SHOTS[id] || []).length >= 3) add(ps, { ...slideScreens(ctx, p, tag), hue });
      add(ps, { ...slideArch(ctx, p, tag), hue });
      add(ps, { ...slideLoop(ctx, p, tag), hue });
      add(ps, { ...slideSys(ctx, p, tag), hue });
      const mods = models.filter(m => m.project === id);
      if (mods.length) add(ps, { ...slideModels(ctx, p, mods, tag), hue });
      add(ps, { ...slideEvidence(ctx, p, tag), hue });
    });
    add(st, slideMore(ctx, ch));
    // more 슬라이드는 챕터 스테이션의 두 번째 슬라이드: 챕터 끝에서 다시 돌아오도록 순서를 재배치
  }
  // ---- archive
  st = station(chapters[6], 'archive');
  add(st, slideTimeline(ctx));
  add(st, slideIndex(ctx));
  add(st, slideEnd(ctx));

  // flatten in narrative order: chapter cover → projects → more
  const order = [];
  for (const s of stations) {
    if (CATS[s.chapter.cat] && s.key === s.chapter.id) {
      order.push(s.slides[0]);
      continue;
    }
    order.push(...s.slides);
    const ch = s.chapter;
    if (ch.deep && s.key === ch.deep[ch.deep.length - 1]) {
      const chapterStation = stations.find(x => x.key === ch.id);
      order.push(chapterStation.slides[1]);
    }
  }
  order.forEach((s, i) => (s.index = i));
  return { slides: order, stations, chapters, ctx };
}

/* =========================================================
   Shared builders
   ========================================================= */
function starCloud(color, n = 260, r = 26) {
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, rr = r * (.35 + Math.random() * .75), y = (Math.random() - .5) * r * .5;
    pos.set([Math.cos(a) * rr, y, Math.sin(a) * rr], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ color: new THREE.Color(color).multiplyScalar(1.4), size: .14, transparent: true, opacity: .7, depthWrite: false, blending: THREE.AdditiveBlending }));
}

function core(color = LIME, scale = 1) {
  const g = new THREE.Group();
  const c = new THREE.Color(color);
  const inner = new THREE.Mesh(new THREE.IcosahedronGeometry(2.6 * scale, 3), new THREE.MeshStandardMaterial({ color: 0x0b0f14, metalness: .9, roughness: .25, emissive: c.clone().multiplyScalar(.08) }));
  g.add(inner);
  const wire = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(3.4 * scale, 1)), new THREE.LineBasicMaterial({ color: c.clone().multiplyScalar(2.4), transparent: true, opacity: .55 }));
  g.add(wire);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(1.25 * scale, 32, 24), new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(4) }));
  g.add(glow);
  const rings = orbitRings(color, 6.5 * scale);
  g.add(rings);
  g.userData.tick = t => { wire.rotation.y = t * .18; wire.rotation.x = t * .07; inner.rotation.y = -t * .1; rings.rotation.y = t * .05; glow.scale.setScalar(1 + Math.sin(t * 2) * .06); };
  return g;
}

function satellites(projects, R = 13, onPick, labels = true) {
  const g = new THREE.Group();
  const items = [];
  projects.forEach((p, i) => {
    const col = new THREE.Color(CATS[p.category].color);
    const size = .22 + Math.log10(1 + p.counts.codex + p.counts.claude) * .16;
    const m = new THREE.Mesh(new THREE.SphereGeometry(size, 18, 14), new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(1.5) }));
    const orbit = { r: R * (.75 + (i % 5) * .12), a: i / projects.length * Math.PI * 2, s: .05 + (i % 3) * .018, tilt: ((i % 7) - 3) * .08, y: ((i % 4) - 1.5) * .9 };
    m.userData = { p, orbit };
    g.add(m);
    if (labels) {
      const l = label(`<small>${String(p.index).padStart(2, '0')}</small>${esc(p.title)}`, 'pj' + (W[p.id] ? ' deep' : ''), { '--c': CATS[p.category].color });
      l.center.set(-.12, .5);
      l.element.addEventListener('click', () => onPick?.(p));
      m.add(l);
      m.userData.label = l;
    }
    items.push(m);
  });
  g.userData.tick = t => items.forEach(m => {
    const o = m.userData.orbit, a = o.a + t * o.s;
    m.position.set(Math.cos(a) * o.r, o.y + Math.sin(a) * o.r * o.tilt, Math.sin(a) * o.r);
  });
  g.userData.items = items;
  return g;
}

function labelsOn(group, on) {
  group.traverse(o => { if (o.isCSS2DObject) o.element.classList.toggle('on', on); });
}

function genericApi(group, extra = {}) {
  const ticks = [];
  group.traverse(o => o.userData?.tick && ticks.push(o.userData.tick));
  return {
    group,
    update: (t, dt) => ticks.forEach(f => f(t, dt)),
    enter() { labelsOn(group, true); },
    leave() { labelsOn(group, false); },
    ...extra,
  };
}

function bigCard(title, sub, color, w = 22) {
  const n = makeNode({ title, sub, color, w, h: w * .3 });
  n.setState('on', true);
  return n;
}

/* =========================================================
   Intro
   ========================================================= */
function slideTitle({ A }) {
  return {
    id: 'orbit', type: 'title', layout: 'left', title: 'ORBIT',
    html: () => `<div class="panel reveal">
      <div class="eyebrow">Project archive · 2026.06 — 2026.10</div>
      <h1 class="display">ORB<em>I</em>T</h1>
      <p class="lead">Claude·Codex와 함께 만든 ${A.counts.projects}개 프로젝트. 무엇을 만들었는지보다, <b>어떻게 돌아가게 만들었는지</b>를 실제 소스 구조와 기록으로 보여드립니다.</p>
      <p class="small mono">→ 키 또는 스크롤로 이동 · G 목차 · P 발표 모드</p>
    </div>`,
    view: { fit: { w: 36, h: 30 }, dir: [-.2, .2, 1], target: [0, 0, 0] },
    build: ({ P }) => {
      const g = new THREE.Group();
      const c = core(LIME, 1.15);
      g.add(c);
      const sats = satellites(Object.values(P), 15, null, false);
      g.add(sats);
      g.add(starCloud(LIME, 500, 30));
      return genericApi(g);
    },
    notes: ['5개월 동안 26개 프로젝트를 AI 에이전트와 함께 만들었습니다.', '오늘은 결과 화면보다 각 프로젝트가 내부에서 어떻게 돌아가는지, 그 구조를 보여드리겠습니다.', '모든 수치와 구조는 실제 소스·문서·Git 기록에서 확인한 것입니다.'],
  };
}

function slideNumbers({ A }) {
  const c = A.counts;
  return {
    id: 'numbers', type: 'numbers', layout: 'center', title: '숫자로 본 5개월',
    html: () => `<div class="panel reveal">
      <div class="eyebrow">By the numbers</div>
      <h2 class="title">5개월, 26개의 궤도.</h2>
      <div class="stats">
        <div><b data-count="${c.projects}">${c.projects}</b><span>프로젝트</span></div>
        <div><b data-count="${c.codexThreads}">${nf(c.codexThreads)}</b><span>Codex 스레드 (하위 에이전트 포함)</span></div>
        <div><b data-count="${c.claudeSessions}">${c.claudeSessions}</b><span>Claude 세션 · 요청 ${nf(c.claudeRequests)}회</span></div>
        <div><b data-count="${c.milestones}">${c.milestones}</b><span>정리한 발전 기록</span></div>
        <div><b data-count="${c.visuals}">${c.visuals}</b><span>실행 캡처 · 렌더 · 그래프</span></div>
        <div><b data-count="${c.documents}">${c.documents}</b><span>줄 번호·해시가 붙은 원문 발췌</span></div>
        <div><b>11</b><span>소스까지 열어 구조를 추출한 프로젝트</span></div>
        <div><b>${c.folders}</b><span>작업 폴더</span></div>
      </div>
      <p class="small">세션·스레드 수는 기여도나 완성도 지표가 아닙니다. 남아 있는 로컬 기록에서 센 값입니다.</p>
    </div>`,
    view: { fit: { w: 50, h: 34 }, dir: [.55, .55, .8], target: [-110, 0, 0] },
    build: () => genericApi(new THREE.Group()),
    notes: ['Codex 스레드 1,140개, Claude 세션 156개. 단 이 숫자는 기여도가 아니라 남은 기록의 양입니다.', '이 중 11개 프로젝트는 소스까지 직접 열어 구조를 추출했습니다.'],
  };
}

function slideUniverse({ P }) {
  const counts = {};
  Object.values(P).forEach(p => (counts[p.category] = (counts[p.category] || 0) + 1));
  return {
    id: 'universe', type: 'universe', layout: 'left', title: '프로젝트 우주',
    html: () => `<div class="panel reveal">
      <div class="eyebrow">Project universe</div>
      <h2 class="title">여섯 개의 성단.</h2>
      <p class="lead">프로젝트를 분야별 성단으로 배치했습니다. 크기는 남은 작업 기록의 양, <span style="color:var(--accent)">●</span> 표시는 소스 구조까지 분석한 프로젝트입니다. 이름을 누르면 바로 이동합니다.</p>
      <div class="legend">${Object.entries(CATS).map(([k, c]) => `<button type="button" data-cat="${k}" style="--c:${c.color}"><i></i>${c.ko}<b>${counts[k] || 0}</b></button>`).join('')}</div>
      <p class="small">드래그로 회전 · 더블클릭으로 원위치</p>
    </div>`,
    view: { fit: { w: 98, h: 66 }, dir: [0, 1.1, 1], target: [0, -1, 0] },
    build: ({ P }, deck) => {
      const g = new THREE.Group();
      const cats = Object.keys(CATS);
      const hubs = {};
      cats.forEach((k, i) => {
        const a = i / cats.length * Math.PI * 2 + .3;
        const hp = V(Math.cos(a) * 30, (i % 2 ? 1.5 : -1.5), Math.sin(a) * 22);
        hubs[k] = hp;
        const col = new THREE.Color(CATS[k].color);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.2, .04, 8, 60), new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(2.5) }));
        ring.position.copy(hp);
        ring.lookAt(hp.clone().add(V(0, 1, 0)));
        g.add(ring);
        const l = label(CATS[k].en, 'hub', { '--c': CATS[k].color });
        l.position.copy(hp).add(V(0, -1.9, 0));
        g.add(l);
      });
      const pts = [];
      const items = [];
      const byCat = {};
      Object.values(P).forEach(p => (byCat[p.category] ||= []).push(p));
      Object.entries(byCat).forEach(([k, list]) => {
        list.forEach((p, i) => {
          const a = i / list.length * Math.PI * 2 + k.length;
          const r = 4.6 + (i % 2) * 2.6;
          const pos = hubs[k].clone().add(V(Math.cos(a) * r, Math.sin(a * 2) * 1.6, Math.sin(a) * r * .8));
          const col = new THREE.Color(CATS[k].color);
          const size = .28 + Math.log10(1 + p.counts.codex + p.counts.claude) * .2;
          const m = new THREE.Mesh(new THREE.SphereGeometry(size, 20, 16), new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(W[p.id] ? 2.6 : 1.2) }));
          m.position.copy(pos);
          g.add(m);
          pts.push(hubs[k], pos);
          const l = label(`<small>${String(p.index).padStart(2, '0')}</small>${esc(p.title)}`, 'pj' + (W[p.id] ? ' deep' : ''), { '--c': CATS[k].color });
          l.center.set(-.15, .5);
          l.element.addEventListener('click', () => deck.openProject(p.id));
          l.userData.cat = k;
          m.add(l);
          items.push({ m, l, k });
        });
      });
      const lines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x8fa3bf, transparent: true, opacity: .18 }));
      g.add(lines);
      g.add(starCloud('#8fa3bf', 600, 40));
      const api = genericApi(g, {
        highlight(k) { items.forEach(it => it.l.element.classList.toggle('dim', !!k && it.k !== k)); },
      });
      const base = api.update;
      api.update = (t, dt) => { base(t, dt); g.rotation.y = Math.sin(t * .05) * .25; };
      return api;
    },
    mount(el, api) {
      el.querySelectorAll('[data-cat]').forEach(b => {
        b.addEventListener('mouseenter', () => api?.highlight(b.dataset.cat));
        b.addEventListener('mouseleave', () => api?.highlight(null));
        b.addEventListener('click', () => { const on = b.classList.toggle('on'); el.querySelectorAll('[data-cat]').forEach(x => x !== b && x.classList.remove('on')); api?.highlight(on ? b.dataset.cat : null); });
      });
    },
    notes: ['게임·세계, AI·로봇, 도구, 영상, 글, 실험 — 여섯 분야입니다.', '점이 밝은 11개가 오늘 소스 구조까지 열어볼 프로젝트입니다.'],
  };
}

/* =========================================================
   Method
   ========================================================= */
const METHOD = [
  { label: '요청 기록', desc: '당시 요청 원문을 남깁니다. “1인칭 시점에서 커피 만드는 게 잘 안 보인다” 같은 문장이 설계의 출발점이 됩니다.', module: 'qa/*/README.md · 사용자 원문' },
  { label: '경계 설계', desc: '바꿀 것과 바꾸지 않을 것을 먼저 정합니다. Vesna는 “Autoload끼리 호출 금지”, Claude Local은 “폴더 밖 경로 거절”.', module: 'CLAUDE.md · AGENTS.md · ADR' },
  { label: '구현', desc: 'Codex·Claude 세션에서 실제 코드를 작성합니다. 에이전트는 계획 파일과 스키마를 입력으로 받습니다.', module: 'Codex 1,140 threads · Claude 156 sessions' },
  { label: '측정', desc: '테스트·캡처·프로브로 숫자를 남깁니다. Vesna 2,004 checks, Nerulio 2,797 tests, Shorts −16.18 LUFS.', module: 'tests/ · qa/ · qc_report.json' },
  { label: '판정 · 되돌리기', desc: '더 나아지지 않으면 되돌립니다. Go2는 새 체크포인트 대신 C0_5500을, Gauntlet은 rollback_best를 선택했습니다.', module: 'final_gates · checkpoints' },
  { label: '기록', desc: '검증한 것과 하지 않은 것을 구분해 적습니다. PASS · PARTIAL · NOT TESTED.', module: 'STATUS.md · verification.md · 영수증' },
];
function slideMethod() {
  return {
    id: 'method', type: 'loop', layout: 'left', title: 'AI와 일하는 루프', steps: METHOD.length,
    html: () => `<div class="panel reveal">
      <div class="eyebrow">Method · 01</div>
      <h2 class="title">요청에서 기록까지,\n한 바퀴.</h2>
      <p class="lead">26개 프로젝트에 공통으로 남은 작업 순서입니다. AI가 코드를 쓰는 속도보다, 무엇을 측정하고 언제 되돌릴지 정하는 쪽에 시간을 썼습니다.</p>
      <ol class="steps">${METHOD.map(s => `<li><b>${esc(s.label)}</b><span>${esc(s.desc)}</span><code>${esc(s.module)}</code></li>`).join('')}</ol>
    </div>`,
    view: { fit: { w: 34, h: 26 }, dir: [0, .12, 1], target: [0, 0, 0] },
    build: () => {
      const ring = buildRing(METHOD, { color: LIME, closed: true, hub: 'AI 협업 루프' });
      ring.group.add(starCloud(LIME, 200, 24));
      return { group: ring.group, update: ring.update, step: i => ring.setStep(i - 1), pickables: ring.pickables, ring };
    },
    notes: ['모든 프로젝트가 같은 여섯 단계를 지났습니다.', '핵심은 측정과 판정 — 나아지지 않으면 되돌린다는 규칙입니다.'],
  };
}

function slideEvidencePrinciple({ A }) {
  const docs = A.proof.documents.filter(d => d.excerpt.length > 300);
  return {
    id: 'evidence', type: 'docs', layout: 'left', title: '주장보다 기록',
    html: () => `<div class="panel reveal">
      <div class="eyebrow">Method · 02</div>
      <h2 class="title">주장보다 기록.</h2>
      <p class="lead">화면이 없는 작업을 만들어 채우지 않았습니다. 모든 장면은 실제 실행 캡처·렌더·문서에서 왔고, 원문 발췌에는 줄 번호와 SHA-256이 붙어 있습니다.</p>
      <div class="numgrid">
        <div><b>${A.counts.visuals}</b><span>시각 자료 · 12개 프로젝트</span></div>
        <div><b>${A.counts.documents}</b><span>원문 발췌 · 줄 번호</span></div>
        <div><b>${A.counts.models}<small>GLB</small></b><span>원본 3D 모델</span></div>
      </div>
      <div class="callout"><b>구분해서 씁니다.</b> 요청 · 구현 · 검증 · 중단. 최초 발견일은 착수일이 아니고, 역사적 검증 문서는 현재 상태의 보증이 아닙니다.</div>
    </div>`,
    view: { fit: { w: 36, h: 24 }, dir: [.35, .2, 1], target: [0, 0, 0] },
    build: () => {
      const g = new THREE.Group();
      docs.slice(0, 16).forEach((d, i) => {
        const a = i * .55, r = 9 + i * .55;
        const n = makeNode({ title: d.title, sub: `${d.source.split('/').slice(-2).join('/')} · L${d.lineStart}–${d.lineEnd}`, tag: d.sha256.slice(0, 8), color: CATS[A.projects.find(p => p.id === d.project)?.category || 'lab'].color, w: 7.2, h: 1.8 });
        n.position.set(Math.cos(a) * r * .9, 8 - i * 1.05, Math.sin(a) * r * .6 - 4);
        n.lookAt(n.position.clone().add(V(Math.cos(a) * .3, 0, 1)));
        n.userData.mesh.userData.tip = { label: d.title, path: d.source, desc: d.excerpt.slice(0, 160) + '…' };
        g.add(n);
      });
      g.add(starCloud(LIME, 200, 22));
      const api = genericApi(g);
      const base = api.update;
      api.update = (t, dt) => { base(t, dt); g.rotation.y = Math.sin(t * .1) * .12; };
      api.pickables = [];
      g.traverse(o => o.userData?.tip && api.pickables.push(o));
      return api;
    },
    notes: ['없는 실행 화면은 만들지 않았습니다.', '문서 발췌마다 줄 번호와 해시가 있어서 원본과 대조할 수 있습니다.'],
  };
}

/* =========================================================
   Chapter
   ========================================================= */
function slideChapter({ P }, ch) {
  const list = Object.values(P).filter(p => (ch.deep.concat(ch.more)).includes(p.id));
  const leads = {
    worlds: 'Godot와 Roblox로 만든 게임들. 화면 뒤의 상태 기계, 서버-클라이언트 경계, 성장 공식까지 들어갑니다.',
    intelligence: '로봇 강화학습, 3D 에셋 생성 검증, 음성 비서, 코딩 에이전트. 모델을 믿기보다 측정하고 되돌리는 구조.',
    systems: '브라우저 안에서 파일을 처리하는 작업실과, 코딩 세션을 수업으로 바꾸는 학습 도구.',
    motion: '계획 파일에서 시작하는 숏폼 파이프라인과, 격리된 초고 창을 가진 집필 엔진.',
  };
  return {
    id: ch.id, type: 'chapter', layout: 'left', title: `${ch.no} ${ch.en}`, hue: ch.color,
    html: () => `<div class="panel reveal">
      <div class="eyebrow">Chapter ${ch.no}</div>
      <p class="chapter-no">${ch.no}</p>
      <h2 class="title">${esc(ch.en)}<span class="en">${esc(ch.ko)}</span></h2>
      <p class="lead">${leads[ch.id]}</p>
      <div class="chips">${ch.deep.map(id => `<button type="button" class="chip hue" data-open="${id}">${esc(P[id].title)}</button>`).join('')}${ch.more.map(id => `<button type="button" class="chip" data-open="${id}">${esc(P[id].title)}</button>`).join('')}</div>
    </div>`,
    view: { fit: { w: 36, h: 26 }, dir: [0, .4, 1], target: [0, 0, 0] },
    build: (_, deck) => {
      const g = new THREE.Group();
      const c = core(ch.color, .8);
      g.add(c);
      g.add(satellites(list, 12, p => deck.openProject(p.id)));
      g.add(starCloud(ch.color, 300, 26));
      return genericApi(g);
    },
    notes: [leads[ch.id]],
  };
}

/* =========================================================
   Project slides
   ========================================================= */
function eyebrow(p, tag, what) { return `<div class="eyebrow">${tag} · ${esc(p.title)} · ${what}</div>`; }

function slideCover({ media, shots }, p, tag) {
  const w = W[p.id];
  const list = shots[p.id] || [];
  const heroShot = list.find(x => x.kind === 'video') || list.find(x => x.cover) || null;
  const hero = p.image && media[p.media?.[0]] ? media[p.media[0]] : null;
  const coverImg = { vesna: 'ev-00', lastlight: 'ev-11', pets: 'ev-15', go2: 'ev-33', jarvis: 'ev-25', nerulio: 'nerulio-pixel', learn: 'learn-curriculum' }[p.id];
  const img = coverImg ? media[coverImg] : hero;
  return {
    id: `${p.id}`, type: 'cover', layout: 'left', title: p.title,
    html: () => `<div class="panel reveal">
      ${eyebrow(p, tag, esc(p.stack.join(' · ')))}
      <h2 class="title">${esc(w.headline)}<span class="en">${esc(p.title)} — ${esc(p.subtitle)}</span></h2>
      <p class="lead">${esc(p.description)}</p>
      <dl class="facts">
        <div><dt>기록 기간</dt><dd>${md(p.first)}<small>→ ${md(p.last)}</small></dd></div>
        <div><dt>Codex</dt><dd>${nf(p.counts.codex)}<small>threads</small></dd></div>
        <div><dt>Claude</dt><dd>${nf(p.counts.claude)}<small>sessions</small></dd></div>
      </dl>
      <div class="ba"><div><b>BEFORE</b><p>${esc(p.before)}</p></div><div><b>AFTER</b><p>${esc(p.after)}</p></div></div>
    </div>`,
    view: { fit: { w: 30, h: 19 }, dir: [-.28, .1, 1], target: [0, 0, 0] },
    build: () => {
      const g = new THREE.Group();
      const color = CATS[p.category].color;
      let scr = null;
      if (heroShot) {
        scr = screenSwap({ w: 26, maxH: 16, color });
        scr.group.rotation.y = -.16;
        scr.show(heroShot, true);
        g.add(scr.group);
      } else if (img) {
        const aspect = img.width / img.height;
        const wv = aspect > 2.5 ? 30 : aspect < 1 ? 11 : 24;
        const plane = imagePlane(img.src, { w: wv, aspect, color });
        plane.rotation.y = -.16;
        g.add(plane);
        plane.userData.mesh.userData.tip = { label: img.title, path: img.source, desc: img.note || `${img.version} · ${img.width}×${img.height}` };
        plane.userData.mesh.userData.onClick = () => window.dispatchEvent(new CustomEvent('orbit:lightbox', { detail: img }));
        g.userData.pick = [plane.userData.mesh];
      } else {
        g.add(bigCard(p.title, p.subtitle, color));
      }
      g.add(starCloud(color, 260, 28));
      const api = genericApi(g);
      api.pickables = g.userData.pick || [];
      if (scr) {
        api.enter = () => { labelsOn(g, true); scr.play(); };
        api.leave = () => { labelsOn(g, false); scr.pause(); };
      }
      return api;
    },
    notes: [p.description, `이전: ${p.before}`, `이후: ${p.after}`],
  };
}

function slideArch(ctx, p, tag) {
  const a = W[p.id].arch;
  const mods = Object.fromEntries(a.modules.map(m => [m.id, m]));
  const shotList = ctx.shots[p.id] || [];
  const modShot = id => shotList.find(x => x.module === id && x.kind !== 'video') || shotList.find(x => x.module === id);
  return {
    id: `${p.id}/arch`, type: 'arch', layout: 'left', title: `${p.title} · 구조`, steps: a.flows.length,
    html: () => `<div class="panel reveal">
      ${eyebrow(p, tag, 'Architecture')}
      <h2 class="title">${esc(a.title)}</h2>
      <p class="lead">${esc(a.lead)}</p>
      <div class="callout" data-flowbox><b>모듈 ${a.modules.length} · 흐름 ${a.flows.length}</b> — <kbd>→</kbd>를 누르면 데이터가 어디서 어디로 가는지 하나씩 따라갑니다. 노드를 누르면 연결이 보입니다.</div>
      <div class="zones">${(a.zones || []).map(z => `<span>${esc(z.label)}</span>`).join('')}</div>
    </div>`,
    view: { fit: null, dir: [.06, .1, 1], target: [0, 0, 0] },
    build: (_, deck) => {
      const color = CATS[p.category].color;
      const gr = buildGraph(a, { color, onPick: m => deck.inspectModule(p, m) });
      gr.group.add(starCloud(color, 200, 30));
      return {
        group: gr.group, graph: gr, update: gr.update, pickables: gr.pickables,
        fit: { w: gr.size.x + 2, h: gr.size.y + 3 },
        enter() { gr.labels(true); },
        leave() { gr.labels(false); gr.reset(); },
        step: i => (i ? gr.focusFlow(i - 1) : gr.reset()),
      };
    },
    onStep(el, i) {
      const box = el.querySelector('[data-flowbox]');
      el.querySelectorAll('[data-mod]').forEach(b => b.classList.remove('on'));
      if (!i) {
        box.innerHTML = `<b>모듈 ${a.modules.length} · 흐름 ${a.flows.length}</b> — <kbd>→</kbd>를 누르면 데이터가 어디서 어디로 가는지 하나씩 따라갑니다. 노드를 누르면 연결이 보입니다.`;
        return;
      }
      const f = a.flows[i - 1];
      const sh = modShot(f.to) || modShot(f.from);
      box.innerHTML = `<span class="mono" style="font-size:11px;color:var(--dim)">FLOW ${String(i).padStart(2, '0')} / ${a.flows.length}</span><br><b>${esc(mods[f.from].label)} → ${esc(mods[f.to].label)}</b> <code class="mono" style="color:var(--hue);font-size:11.5px">${esc(f.label)}</code><br>${esc(f.desc || '')}${sh ? `<figure class="flowshot"><img src="${esc(sh.poster || sh.src)}" alt="${esc(sh.title)}"><figcaption>실제 화면 · ${esc(sh.title)}</figcaption></figure>` : ''}`;
      box.querySelector('.flowshot')?.addEventListener('click', () => window.dispatchEvent(new CustomEvent('orbit:lightbox', { detail: { ...sh, src: sh.poster || sh.src, note: sh.caption } })));
      el.querySelector(`[data-mod="${f.from}"]`)?.classList.add('on');
      el.querySelector(`[data-mod="${f.to}"]`)?.classList.add('on');
    },
    mount(el, api, deck) {
      el.querySelectorAll('[data-mod]').forEach(b => {
        b.addEventListener('mouseenter', () => api?.graph.focusNode(b.dataset.mod));
        b.addEventListener('mouseleave', () => (deck.step ? api?.graph.focusFlow(deck.step - 1) : api?.graph.reset()));
        b.addEventListener('click', () => deck.inspectModule(p, mods[b.dataset.mod]));
      });
    },
    notes: [a.lead, ...a.flows.slice(0, 4).map(f => `${mods[f.from].label} → ${mods[f.to].label}: ${f.label}`)],
  };
}

function slideLoop({ shots }, p, tag) {
  const l = W[p.id].loop;
  const list = (shots[p.id] || []).filter(x => Number.isInteger(x.stage));
  const byStage = l.stages.map((_, i) => list.find(x => x.stage === i) || null);
  const hasScreens = list.length >= 2;
  const shotFor = i => {
    if (byStage[i]) return byStage[i];
    for (let k = i - 1; k >= 0; k--) if (byStage[k]) return byStage[k];
    return list[0];
  };
  const dir = [0, l.closed ? .14 : .22, 1];
  return {
    id: `${p.id}/loop`, type: 'loop', layout: 'left', title: `${p.title} · ${l.closed ? '루프' : '파이프라인'}`, steps: l.stages.length,
    html: () => `<div class="panel reveal">
      ${eyebrow(p, tag, l.closed ? 'Core loop' : 'Pipeline')}
      <h2 class="title">${esc(l.title)}</h2>
      <p class="lead">${esc(l.lead)}</p>
      <ol class="steps">${l.stages.map((s, i) => `<li><b>${esc(s.label)}${byStage[i] ? ' <i class="cam" title="실제 화면 있음">●</i>' : ''}</b><span>${esc(s.desc)}</span><code>${esc(s.module)}</code></li>`).join('')}</ol>
    </div>`,
    view: { fit: null, dir, target: [0, 0, 0] },
    build: (_, deck) => {
      const color = CATS[p.category].color;
      const ring = buildRing(l.stages, { color, closed: l.closed, hub: hasScreens ? '' : l.hub, onPick: i => deck.setStep(i + 1) });
      ring.group.add(starCloud(color, 220, 26));
      const xs = ring.points.map(q => q.x), ys = ring.points.map(q => q.y);
      const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
      let fit = { w: maxX - minX + 9, h: maxY - minY + 6 }, target = [0, 0, 0], scr = null;
      if (hasScreens) {
        if (l.closed) {
          const maxH = 2 * (maxY - 1.05) - 6;
          const w = Math.min(2 * (maxX - 3.5) - 10, maxH * 16 / 9);
          scr = screenSwap({ w, maxH, color });
          scr.group.position.set(0, .2, -5);
        } else {
          const w = Math.min(30, maxX - minX + 2);
          const h = Math.min(15, w * 9 / 16);
          scr = screenSwap({ w, maxH: 15, color });
          scr.group.position.set(0, maxY + 1.05 + 2.4 + h / 2, -6);
          const top = maxY + 3.4 + h, bot = minY - 1.05;
          fit = { w: Math.max(fit.w, w + 6), h: top - bot + 4 };
          target = [0, (top + bot) / 2, 0];
        }
        ring.group.add(scr.group);
        scr.show(shotFor(0), true);
      }
      return {
        group: ring.group, update: ring.update, pickables: ring.pickables, ring, fit,
        view: () => ({ target, dir, fit }),
        step: i => {
          ring.setStep(i - 1);
          scr?.show(shotFor(Math.max(0, i - 1)));
        },
        enter: () => { scr?.play(); labelsOn(ring.group, true); },
        leave: () => { ring.setStep(-1); scr?.pause(); labelsOn(ring.group, false); },
      };
    },
    notes: l.stages.map((s, i) => `${i + 1}. ${s.label} — ${s.desc}${byStage[i] ? ` [화면: ${byStage[i].title}]` : ''}`),
  };
}

function slideScreens({ shots }, p, tag) {
  const list = (shots[p.id] || []).slice(0, 14);
  const stages = W[p.id].loop.stages;
  const n = list.length;
  const metaOf = sh => [sh.version, sh.date, sh.kind === 'video' ? '실행 영상' : null].filter(Boolean).join(' · ');
  const card = i => {
    if (!i) return `<b>${n}개의 실제 화면</b><p>프로젝트 폴더에 남은 QA 캡처·렌더·실행 영상을 변환만 해서 가져왔습니다. <kbd>→</kbd>를 누르면 한 장씩 가까이 갑니다.</p>`;
    const sh = list[i - 1];
    const st = Number.isInteger(sh.stage) ? stages[sh.stage] : null;
    return `<span class="shot-no">${String(i).padStart(2, '0')} / ${n}${st ? ` · STAGE ${String(sh.stage + 1).padStart(2, '0')} ${esc(st.label)}` : ''}</span>
      <b>${esc(sh.title)}</b><p>${esc(sh.caption)}</p>
      <code>${esc(metaOf(sh))}${sh.source ? `<br>${esc(sh.source)}` : ''}</code>`;
  };
  return {
    id: `${p.id}/screens`, type: 'screens', layout: 'left', title: `${p.title} · 실제 화면`, steps: n,
    html: () => `<div class="panel reveal">
      ${eyebrow(p, tag, 'Real screens')}
      <h2 class="title">실제 화면으로 보는\n${esc(p.title)}.</h2>
      <div class="shotcard" data-shotcard>${card(0)}</div>
      <div class="shotdots">${list.map((sh, i) => `<button type="button" data-shot="${i + 1}" title="${esc(sh.title)}"><img src="${esc(sh.poster || sh.src)}" alt="" loading="lazy">${sh.kind === 'video' ? '<i>▶</i>' : ''}</button>`).join('')}</div>
    </div>`,
    view: { fit: null, dir: [0, .08, 1], target: [0, 0, 0] },
    build: (_, deck) => {
      const color = CATS[p.category].color;
      const g = new THREE.Group();
      const H = 8.4, gap = 1.4;
      const per = n <= 4 ? n : n <= 8 ? Math.ceil(n / 2) : Math.ceil(n / 3);
      const rows = [];
      for (let i = 0; i < n; i += per) rows.push(list.slice(i, i + per).map((_, k) => i + k));
      const items = [];
      const aspectOf = sh => (sh.width && sh.height ? sh.width / sh.height : 16 / 9);
      let maxW = 0;
      rows.forEach((row, r) => {
        const ws = row.map(i => Math.min(H * aspectOf(list[i]), 15.5));
        const total = ws.reduce((a, b) => a + b, 0) + gap * (row.length - 1);
        maxW = Math.max(maxW, total);
        let x = -total / 2;
        row.forEach((i, k) => {
          const w = ws[k], cx = x + w / 2;
          x += w + gap;
          const y = ((rows.length - 1) / 2 - r) * (H + 3);
          const holder = new THREE.Group();
          holder.position.set(cx, y, .009 * cx * cx);
          holder.rotation.y = -Math.atan(.018 * cx);
          const sh = list[i];
          const hh = Math.min(H, w / aspectOf(sh));
          const mat = new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 1 });
          const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, hh), mat);
          holder.add(mesh);
          const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(w + .1, hh + .1)), new THREE.LineBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2), transparent: true, opacity: .25 }));
          holder.add(edge);
          const num = label(`${String(i + 1).padStart(2, '0')} ${esc(sh.title)}`, 'shot-tag');
          num.center.set(0, 0);
          num.position.set(-w / 2, -hh / 2 - .25, 0);
          holder.add(num);
          items[i] = { holder, mesh, mat, edge, w, h: hh, video: null, sh };
          mediaTexture(sh).then(({ tex, video }) => {
            if (tex) { mat.map = tex; mat.color.setScalar(.85); mat.needsUpdate = true; }
            items[i].video = video || null;
          });
          mesh.userData = { tip: { label: sh.title, path: metaOf(sh), desc: sh.caption }, onClick: () => deck.setStep(i + 1) };
          g.add(holder);
        });
      });
      g.add(starCloud(color, 240, 30));
      const fit0 = { w: maxW + 14, h: rows.length * (H + 3) + 2 };
      let cur = 0;
      const api = {
        group: g, fit: fit0, pickables: items.map(it => it.mesh),
        view(step) {
          if (!step) return { target: [0, 0, 0], dir: [0, .08, 1], fit: fit0 };
          const it = items[step - 1];
          const ry = it.holder.rotation.y;
          return { target: it.holder.position.toArray(), dir: [Math.sin(ry), .05, Math.cos(ry)], fit: { w: it.w * 1.1, h: it.h * 1.25 } };
        },
        step(i) {
          cur = i;
          items.forEach((it, k) => {
            const focus = i && k === i - 1;
            gsap.to(it.mat, { opacity: !i || focus ? 1 : .1, duration: .5 });
            gsap.to(it.edge.material, { opacity: focus ? .9 : .25, duration: .5 });
            if (it.video) (!i || focus) ? it.video.play().catch(() => {}) : it.video.pause();
          });
        },
        update() {},
        enter() { labelsOn(g, true); api.step(cur); },
        leave() { labelsOn(g, false); items.forEach(it => it.video?.pause()); },
      };
      return api;
    },
    onStep(el, i) {
      el.querySelector('[data-shotcard]').innerHTML = card(i);
      el.querySelectorAll('[data-shot]').forEach(b => b.classList.toggle('on', +b.dataset.shot === i));
      el.querySelector('[data-shot].on')?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    },
    mount(el, api, deck) {
      el.querySelectorAll('[data-shot]').forEach(b => b.addEventListener('click', () => deck.setStep(+b.dataset.shot)));
    },
    notes: list.map((sh, i) => `${i + 1}. ${sh.title} — ${sh.caption}`),
  };
}

function slideSys(ctx, p, tag) {
  const s = W[p.id].sys;
  return {
    id: `${p.id}/system`, type: 'sys', layout: 'left', title: `${p.title} · 상태와 수치`,
    html: () => `<div class="panel reveal">
      ${eyebrow(p, tag, s.chart ? 'Data' : 'States')}
      <h2 class="title">${esc(s.title)}</h2>
      <p class="lead">${esc(s.lead)}</p>
      <div class="numgrid">${s.numbers.map(([v, u, l]) => `<div><b>${esc(v)}${u ? `<small>${esc(u)}</small>` : ''}</b><span>${esc(l)}</span></div>`).join('')}</div>
      <div class="doc"><div class="doc-head"><span>${esc(s.states?.name || 'Rules')}</span><span>source</span></div><pre>${s.extra.map(([k, v]) => `<span style="color:var(--hue)">${esc(k)}</span>  ${esc(v)}`).join('\n')}</pre></div>
    </div>`,
    view: { fit: null, dir: [0, .22, 1], target: [0, 0, 0] },
    build: () => {
      const color = CATS[p.category].color;
      const g = new THREE.Group();
      let api;
      if (s.chart) {
        api = barChart(s.chart, color);
        g.add(api.group);
      } else {
        const st = s.states;
        const ring = buildRing(st.list.map(x => ({ label: x })), { color, closed: st.closed, small: true, radius: st.closed ? 6 : undefined });
        g.add(ring.group);
        const xs = ring.points.map(q => q.x), ys = ring.points.map(q => q.y);
        let k = -1, last = 0;
        api = {
          update: (t, dt) => { ring.update(t, dt); if (t - last > 1.1) { last = t; k = (k + 1) % st.list.length; ring.setStep(k); } },
          fit: { w: Math.max(...xs) - Math.min(...xs) + 8, h: Math.max(...ys) - Math.min(...ys) + 7 },
        };
        const cap = label(esc(st.name), 'zone');
        cap.position.set(0, Math.max(...ys) + 2.6, 0);
        g.add(cap);
      }
      g.add(starCloud(color, 200, 24));
      return { group: g, update: api.update, fit: api.fit, enter() { labelsOn(g, true); api.enter?.(); }, leave() { labelsOn(g, false); } };
    },
    notes: [s.lead, ...s.numbers.slice(0, 3).map(([v, u, l]) => `${v}${u} — ${l}`)],
  };
}

function barChart(chart, color) {
  const g = new THREE.Group();
  const n = chart.bars.length, gap = 3.4, H = 13;
  const col = new THREE.Color(color);
  const bars = [];
  chart.bars.forEach(([name, v], i) => {
    const x = (i - (n - 1) / 2) * gap;
    const h = Math.max(.2, v / chart.max * H);
    const geo = new THREE.BoxGeometry(1.8, 1, 1.8);
    geo.translate(0, .5, 0);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .22 }));
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: col.clone().multiplyScalar(2.4) }));
    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.84, .08, 1.84), new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(3) }));
    const holder = new THREE.Group();
    holder.position.set(x, -H / 2, 0);
    holder.add(m, e);
    cap.position.y = 1;
    holder.add(cap);
    const vl = label(String(v), 'val');
    vl.position.set(0, 1, 0);
    holder.add(vl);
    const nl = label(esc(name), 'month');
    nl.position.set(x, -H / 2 - 1.2, 0);
    g.add(holder, nl);
    bars.push({ m, e, cap, vl, h });
  });
  const base = new THREE.Mesh(new THREE.PlaneGeometry(n * gap + 2, 4), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .05 }));
  base.rotation.x = -Math.PI / 2;
  base.position.y = -H / 2;
  g.add(base);
  const unit = label(esc(chart.unit), 'zone');
  unit.position.set(0, H / 2 + 2, 0);
  g.add(unit);
  const set = k => bars.forEach(b => { b.m.scale.y = b.e.scale.y = Math.max(.001, b.h * k); b.cap.position.y = b.h * k; b.vl.position.y = b.h * k + .9; });
  set(.001);
  return {
    group: g,
    update() {},
    enter() { const o = { k: 0 }; gsap.to(o, { k: 1, duration: 1.4, ease: 'power3.out', onUpdate: () => set(o.k) }); },
    fit: { w: n * gap + 6, h: H + 7 },
  };
}

const gltfLoader = import('three/addons/loaders/GLTFLoader.js').then(m => new m.GLTFLoader());
function slideModels(ctx, p, mods, tag) {
  return {
    id: `${p.id}/model`, type: 'model', layout: 'left', title: `${p.title} · 원본 GLB`,
    html: () => `<div class="panel reveal">
      ${eyebrow(p, tag, 'Original GLB')}
      <h2 class="title">${mods.length > 1 ? '같은 발전기,\n다른 단계.' : '정원 중심\n환경 모델.'}</h2>
      <p class="lead">${mods.length > 1 ? 'Style A 파이프라인의 초기(v01)와 후속(v06) 모델 원본입니다. 렌더 이미지가 아니라 프로젝트에서 내보낸 GLB를 그대로 띄웠습니다.' : '환경 v04에서 다시 잡은 정원 랜드마크의 원본 GLB입니다. v03 대비 실루엣을 키우고 장소의 인상을 분명하게 했습니다.'}</p>
      <div class="numgrid">${mods.map(m => `<div><b>${(m.bytes / 1024).toFixed(0)}<small>KB</small></b><span>${esc(m.title)} · ${esc(m.version)}</span></div>`).join('')}<div><b>GLB</b><span>드래그해서 돌려보세요</span></div></div>
      <p class="small mono">${mods.map(m => `${esc(m.source)} · sha256 ${m.sha256.slice(0, 12)}…`).join('<br>')}</p>
    </div>`,
    view: { fit: { w: mods.length > 1 ? 22 : 14, h: 12 }, dir: [.15, .35, 1], target: [0, 1, 0] },
    build: () => {
      const g = new THREE.Group();
      const color = CATS[p.category].color;
      const holders = [];
      mods.forEach((m, i) => {
        const x = (i - (mods.length - 1) / 2) * 11;
        const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.6, .4, 64), new THREE.MeshStandardMaterial({ color: 0x0d1118, metalness: .6, roughness: .4 }));
        pedestal.position.set(x, -2.2, 0);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(4.4, .03, 8, 120), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.5) }));
        ring.rotation.x = Math.PI / 2;
        ring.position.set(x, -1.98, 0);
        g.add(pedestal, ring);
        const holder = new THREE.Group();
        holder.position.set(x, -2, 0);
        g.add(holder);
        holders.push(holder);
        const l = label(`${esc(m.title)} · <span style="color:${color}">${esc(m.version)}</span>`, 'zone');
        l.position.set(x, -3.4, 2);
        g.add(l);
        gltfLoader.then(loader => loader.load(m.src, gltf => {
          const obj = gltf.scene;
          const box = new THREE.Box3().setFromObject(obj);
          const size = box.getSize(V(0, 0, 0)), c = box.getCenter(V(0, 0, 0));
          const s = 6.5 / Math.max(size.x, size.y, size.z);
          obj.scale.setScalar(s);
          obj.position.set(-c.x * s, -box.min.y * s, -c.z * s);
          holder.add(obj);
        }));
      });
      const key = new THREE.PointLight(new THREE.Color(color), 60, 30);
      key.position.set(0, 6, 6);
      g.add(key);
      const api = genericApi(g);
      api.update = t => holders.forEach((h, i) => (h.rotation.y = t * .3 + i));
      return api;
    },
    notes: ['렌더가 아니라 프로젝트에서 내보낸 원본 GLB를 그대로 불러온 것입니다.'],
  };
}

function slideEvidence({ media, docs, cases, clips, shots }, p, tag) {
  const w = W[p.id];
  const c = cases[p.id];
  const extra = (shots[p.id] || []).filter(x => x.kind !== 'video').map(x => ({ ...x, note: x.caption }));
  const gal = [...(c?.gallery || p.media).map(id => media[id]).filter(Boolean), ...extra];
  const pool = Object.fromEntries(gal.map(m => [m.id, m]));
  const doc = p.documents.map(id => docs[id]).find(d => d && d.excerpt.length > 300);
  const clip = clips.find(x => x.project === p.id);
  let right;
  if (c && c.mode === 'video' && clip) {
    right = `<div class="cmp single"><video src="${clip.src}" poster="${clip.poster}" muted loop playsinline autoplay controls></video></div>
      <div class="evi-cap"><span>${esc(clip.title)} · ${clip.duration}s</span><span>${esc(clip.version)}</span></div>`;
  } else if (c && c.mode === 'wipe') {
    const b = media[c.before], a = media[c.after];
    right = `<div class="cmp" data-cmp style="aspect-ratio:${a.width}/${a.height}"><img src="${b.src}" alt="${esc(b.title)}"><img class="after" src="${a.src}" alt="${esc(a.title)}"><div class="bar"></div><div class="knob" tabindex="0" role="slider" aria-label="비교 위치" aria-valuemin="0" aria-valuemax="100" aria-valuenow="50">↔</div><span class="tag l">BEFORE · ${esc(b.version)}</span><span class="tag r">AFTER · ${esc(a.version)}</span></div>
      <div class="evi-cap"><span>${esc(c.pairType)}</span><span>${esc(c.date || '날짜 미상')}</span></div>`;
  } else if (c && c.mode === 'side') {
    const b = media[c.before], a = media[c.after];
    const tall = a.height > a.width;
    right = `<div class="cmp side"><figure class="${tall ? 'tall' : ''}"><img src="${b.src}" alt="${esc(b.title)}"><span class="tag l">${esc(b.version)}</span></figure><figure class="${tall ? 'tall' : ''}"><img src="${a.src}" alt="${esc(a.title)}"><span class="tag r">${esc(a.version)}</span></figure></div>
      <div class="evi-cap"><span>${esc(c.pairType)}</span><span>${esc(c.date || '')}</span></div>`;
  } else if (gal.length) {
    const m = gal[0];
    right = `<div class="cmp" style="aspect-ratio:${m.width}/${m.height};max-height:52vh" data-main><img src="${m.src}" alt="${esc(m.title)}"><span class="tag l">${esc(m.version)}</span></div>
      <div class="evi-cap"><span data-main-cap>${esc(m.title)}</span><span>${esc(m.date || '')}</span></div>`;
  } else if (doc) {
    right = docCard(doc);
  } else {
    right = `<div class="doc"><div class="doc-head"><span>Version history</span><span>${esc(p.title)}</span></div><pre>${w.versions.map(([d, t]) => `<span style="color:var(--hue)">${esc(d.padEnd(8))}</span> ${esc(t)}`).join('\n')}</pre></div>`;
  }
  const strip = gal.length > 1 ? `<div class="strip">${gal.map(m => `<button type="button" data-ev="${m.id}"><img src="${m.src}" alt="" loading="lazy"><span>${esc(m.title)}</span></button>`).join('')}</div>` : '';
  return {
    id: `${p.id}/evidence`, type: 'evidence', layout: 'left', title: `${p.title} · 기록`, cls: 'has-evi',
    html: () => `<div class="panel reveal">
      ${eyebrow(p, tag, 'Evidence')}
      <h2 class="title">${esc(c ? c.title : '기록으로 남은 것.')}</h2>
      ${c ? `<div class="callout quote">${esc(c.quote)}</div>
      <div class="ba"><div><b>PROBLEM</b><p>${esc(c.problem)}</p></div><div><b>CHANGE</b><p>${esc(c.change)}</p></div></div>` : `<p class="lead">${esc(p.limitation)}</p>`}
      <div class="doc"><div class="doc-head"><span>Version history</span><span>${w.versions.length} milestones</span></div><pre>${w.versions.map(([d, t]) => `<span style="color:var(--hue)">${esc(d.padEnd(8))}</span> ${esc(t)}`).join('\n')}</pre></div>
      <div class="limits">${esc(w.limits)}</div>
    </div>
    <div class="evi reveal">${right}${strip}</div>`,
    view: { fit: { w: 60, h: 30 }, dir: [.5, .55, 1], target: [-220, 0, 0], far: 1.4 },
    build: () => genericApi(new THREE.Group()),
    mount(el) {
      const cmp = el.querySelector('[data-cmp]');
      if (cmp) wipe(cmp);
      el.querySelectorAll('[data-ev]').forEach(b => b.addEventListener('click', () => {
        const m = pool[b.dataset.ev];
        const main = el.querySelector('[data-main]');
        if (main) {
          main.style.aspectRatio = `${m.width}/${m.height}`;
          main.querySelector('img').src = m.src;
          main.querySelector('.tag').textContent = m.version || '';
          el.querySelector('[data-main-cap]').textContent = m.title;
        } else window.dispatchEvent(new CustomEvent('orbit:lightbox', { detail: m }));
      }));
      el.querySelector('[data-main]')?.addEventListener('click', () => {
        const src = el.querySelector('[data-main] img').getAttribute('src');
        const m = gal.find(x => x.src === src);
        if (m) window.dispatchEvent(new CustomEvent('orbit:lightbox', { detail: m }));
      });
    },
    notes: c ? [c.problem, c.change, c.check] : [p.limitation, w.limits],
  };
}

export function docCard(d) {
  const lines = d.excerpt.split('\n');
  return `<div class="doc"><div class="doc-head"><span>${esc(d.source)}</span><span>L${d.lineStart}–${d.lineEnd} · ${d.sha256.slice(0, 10)}</span></div><pre>${lines.map((l, i) => `<span class="ln">${d.lineStart + i}</span>${esc(l)}`).join('\n')}</pre></div>`;
}

function wipe(el) {
  const set = v => { v = Math.max(0, Math.min(100, v)); el.style.setProperty('--cut', v + '%'); el.querySelector('.knob').setAttribute('aria-valuenow', Math.round(v)); };
  let on = false;
  const move = e => { const r = el.getBoundingClientRect(); set((e.clientX - r.left) / r.width * 100); };
  el.addEventListener('pointerdown', e => { on = true; el.setPointerCapture(e.pointerId); move(e); e.stopPropagation(); });
  el.addEventListener('pointermove', e => on && move(e));
  el.addEventListener('pointerup', () => (on = false));
  el.querySelector('.knob').addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault(); e.stopPropagation();
      const cur = parseFloat(el.style.getPropertyValue('--cut')) || 50;
      set(cur + (e.key === 'ArrowLeft' ? -5 : 5));
    }
  });
  // 처음 들어올 때 한 번 쓸어 보여주기
  const o = { v: 50 };
  gsap.timeline({ delay: .9 }).to(o, { v: 18, duration: .8, ease: 'power2.inOut', onUpdate: () => set(o.v) }).to(o, { v: 50, duration: 1, ease: 'power2.inOut', onUpdate: () => set(o.v) });
}

/* =========================================================
   More orbits (non-deep projects in chapter)
   ========================================================= */
function slideMore({ P, media }, ch) {
  const list = ch.more.map(id => P[id]);
  return {
    id: `${ch.id}/more`, type: 'more', layout: 'left', title: `${ch.en} · 더 많은 궤도`, hue: ch.color,
    html: () => `<div class="panel reveal">
      <div class="eyebrow">Chapter ${ch.no} · More orbits</div>
      <h2 class="title">함께 돌던\n다른 궤도들.</h2>
      <p class="lead">소스 구조까지 열지는 않았지만, 실행 화면이나 원문 기록이 남은 프로젝트입니다. 누르면 발전 기록이 열립니다.</p>
      <div class="cards" style="grid-template-columns:1fr;gap:6px;max-height:46vh">${list.map(p => `<button type="button" class="card" data-open="${p.id}" style="--c:${CATS[p.category].color};flex-direction:row;align-items:center">
        <div class="card-body" style="flex:1"><div class="card-top"><i>${esc(CATS[p.category].ko)}</i><span>${md(p.first)} → ${md(p.last)}</span></div><h3>${esc(p.title)}</h3><p>${esc(p.description)}</p></div></button>`).join('')}</div>
    </div>`,
    view: { fit: { w: 44, h: 26 }, dir: [-.15, .12, 1], target: [0, 0, 0] },
    build: (_, deck) => {
      const g = new THREE.Group();
      const n = list.length;
      const pick = [];
      list.forEach((p, i) => {
        const color = CATS[p.category].color;
        const m = media[p.media?.[0]];
        const cols = Math.min(3, n), rows = Math.ceil(n / cols);
        const cx = i % cols, cy = Math.floor(i / cols);
        const inRow = Math.min(cols, n - cy * cols);
        const pos = V((cx - (inRow - 1) / 2) * 14, ((rows - 1) / 2 - cy) * 10.5, -Math.abs(cx - (inRow - 1) / 2) * 3);
        let obj;
        if (m) {
          const asp = m.width / m.height;
          obj = imagePlane(m.src, { w: asp < 1 ? 5.4 : 11.5, aspect: asp, color });
          obj.userData.mesh.userData.tip = { label: p.title, path: m.title, desc: p.description };
          obj.userData.mesh.userData.onClick = () => deck.openProject(p.id);
          pick.push(obj.userData.mesh);
        } else {
          obj = makeNode({ title: p.title, sub: p.stack.join(' · '), color, w: 11.5, h: 3.2, data: {} });
          obj.userData.mesh.userData.tip = { label: p.title, path: p.stack.join(' · '), desc: p.description };
          obj.userData.mesh.userData.onClick = () => deck.openProject(p.id);
          pick.push(obj.userData.mesh);
        }
        obj.position.copy(pos);
        obj.rotation.y = -(pos.x / 14) * .12;
        obj.userData.float = i;
        g.add(obj);
        const l = label(`<small>${String(p.index).padStart(2, '0')}</small>${esc(p.title)}`, 'pj', { '--c': color });
        l.center.set(.5, 0);
        l.position.copy(pos).add(V(0, -(obj.userData.h || 3.2) / 2 - .9, 0));
        l.element.addEventListener('click', () => deck.openProject(p.id));
        g.add(l);
      });
      g.add(starCloud(ch.color, 260, 30));
      const api = genericApi(g);
      api.pickables = pick;
      const base = api.update;
      api.update = (t, dt) => { base(t, dt); g.children.forEach(o => { if (o.userData.float !== undefined) o.position.y += Math.sin(t + o.userData.float) * .004; }); };
      return api;
    },
    notes: list.map(p => `${p.title}: ${p.description}`),
  };
}

/* =========================================================
   Archive
   ========================================================= */
function slideTimeline({ A, P }) {
  const months = A.activity;
  const highlights = {
    '2026-06': '소설 자동화와 CafeVesna의 첫 기록. Ren\'Py → Godot 이식.',
    '2026-07': '집필 엔진을 별도 작업본에서 반복 개선.',
    '2026-08': '3D Gauntlet, Jarvis, 공포 게임. Story Engine V9 → V35.',
    '2026-09': '가장 바쁜 달. Go2·Nerulio·Free Life·Shorts 파이프라인.',
    '2026-10': 'Last Light·Pet Realms 게시, Go2 최종 제출, Claude Local v1.1.0.',
  };
  return {
    id: 'timeline', type: 'timeline', layout: 'center', title: '타임라인',
    html: () => `<div class="panel reveal" style="justify-content:space-between;height:100%">
      <div style="display:flex;flex-direction:column;align-items:center;gap:12px"><div class="eyebrow">Timeline · 2026</div>
      <h2 class="title">다섯 달의 밀도.</h2>
      <p class="lead">월별 Codex 스레드(밝은 기둥)와 Claude 요청 세션(흰 기둥), 바닥의 점은 날짜가 확정된 발전 기록입니다.</p></div>
      <div class="months">${months.map(m => `<div><b>${m.month.replace('2026-', '')}월</b><em>${m.codex + m.claude}</em><p>${esc(highlights[m.month] || '')}</p></div>`).join('')}</div>
    </div>`,
    view: { fit: { w: 58, h: 30 }, dir: [.25, .5, 1], target: [0, -1, 0] },
    build: () => {
      const g = new THREE.Group();
      const max = Math.max(...months.map(m => Math.max(m.codex, m.claude)));
      const H = 16, span = 52;
      const items = [];
      months.forEach((m, i) => {
        const x = (i - 2) * (span / 5);
        [[m.codex, LIME, -1.1], [m.claude, '#e8edf2', 1.1]].forEach(([v, c, dx]) => {
          const h = Math.max(.15, v / max * H);
          const geo = new THREE.BoxGeometry(1.7, 1, 1.7); geo.translate(0, .5, 0);
          const col = new THREE.Color(c);
          const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .16 }));
          const edge = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: col.clone().multiplyScalar(c === LIME ? 2.4 : 1.2) }));
          const hold = new THREE.Group(); hold.position.set(x + dx, -6, 0); hold.add(mesh, edge);
          const vl = label(String(v), 'val'); hold.add(vl);
          g.add(hold);
          items.push({ mesh, edge, vl, h });
        });
        const ml = label(`${m.month.slice(5)}월`, 'month');
        ml.position.set(x, -7.6, 3);
        g.add(ml);
      });
      // milestones scatter on the floor
      const t0 = Date.parse('2026-06-01'), t1 = Date.parse('2026-10-31');
      const cats = Object.keys(CATS);
      const dots = [];
      Object.values(P).forEach(p => p.events.forEach(e => {
        if (!e.date) return;
        const u = (Date.parse(e.date) - t0) / (t1 - t0);
        const x = (u - .5) * span;
        const z = (cats.indexOf(p.category) - 2.5) * 2.2 + 6;
        const d = new THREE.Mesh(new THREE.SphereGeometry(.22, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(CATS[p.category].color).multiplyScalar(e.type === 'implementation' ? 2.6 : 1.2) }));
        d.position.set(x, -6 + .25, z);
        d.userData.tip = { label: e.title, path: `${p.title} · ${e.date}`, desc: e.body };
        g.add(d);
        dots.push(d);
      }));
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(span + 8, 22), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .025 }));
      floor.rotation.x = -Math.PI / 2; floor.position.set(0, -6, 3);
      g.add(floor);
      const set = k => items.forEach(b => { b.mesh.scale.y = b.edge.scale.y = Math.max(.001, b.h * k); b.vl.position.y = b.h * k + .9; });
      set(.001);
      const api = genericApi(g);
      api.pickables = dots;
      api.enter = () => { labelsOn(g, true); const o = { k: 0 }; gsap.to(o, { k: 1, duration: 1.6, ease: 'power3.out', onUpdate: () => set(o.k) }); };
      return api;
    },
    notes: ['9월이 가장 밀도가 높았습니다. Codex 514, Claude 494.', '바닥의 점에 마우스를 올리면 각 발전 기록이 보입니다.'],
  };
}

function slideIndex({ A, media }) {
  return {
    id: 'index', type: 'index', layout: 'full', title: '전체 26개',
    html: () => `<div class="idx reveal">
      <div class="idx-head"><div><div class="eyebrow">Index · ${A.counts.projects} projects</div><h2 class="title" style="margin-top:8px">전체 프로젝트.</h2></div>
        <div class="filters"><input type="search" placeholder="이름 · 기술 검색" data-q aria-label="검색"><button type="button" aria-pressed="true" data-f="all">전체</button>${Object.entries(CATS).map(([k, c]) => `<button type="button" aria-pressed="false" data-f="${k}">${c.ko}</button>`).join('')}<button type="button" aria-pressed="false" data-f="deep">구조 분석</button></div></div>
      <div class="cards">${A.projects.map(p => {
        const m = media[p.media?.[0]];
        return `<button type="button" class="card" data-open="${p.id}" data-cat="${p.category}" data-deep="${W[p.id] ? 1 : 0}" data-text="${esc((p.title + ' ' + p.stack.join(' ') + ' ' + p.description).toLowerCase())}" style="--c:${CATS[p.category].color}">
          <div class="card-img">${m ? `<img src="${m.src}" alt="" loading="lazy">` : `<span class="glyph">${esc(p.title.slice(0, 2))}</span>`}</div>
          <div class="card-body"><div class="card-top"><i>${String(p.index).padStart(2, '0')} · ${esc(CATS[p.category].en)}</i><span>${md(p.first)}</span></div>
          <h3>${esc(p.title)}${W[p.id] ? '<span class="deep">STRUCTURE</span>' : ''}</h3><p>${esc(p.description)}</p></div></button>`;
      }).join('')}</div>
    </div>`,
    view: { fit: { w: 80, h: 40 }, dir: [0, .6, 1], target: [0, 0, 0] },
    build: () => {
      const g = new THREE.Group();
      g.add(orbitRings(LIME, 18));
      g.add(starCloud(LIME, 500, 40));
      return genericApi(g);
    },
    mount(el) {
      let f = 'all', q = '';
      const apply = () => el.querySelectorAll('.card').forEach(c => {
        const ok = (f === 'all' || c.dataset.cat === f || (f === 'deep' && c.dataset.deep === '1')) && (!q || c.dataset.text.includes(q));
        c.style.display = ok ? '' : 'none';
      });
      el.querySelectorAll('[data-f]').forEach(b => b.addEventListener('click', () => {
        f = b.dataset.f;
        el.querySelectorAll('[data-f]').forEach(x => x.setAttribute('aria-pressed', x === b));
        apply();
      }));
      el.querySelector('[data-q]').addEventListener('input', e => { q = e.target.value.trim().toLowerCase(); apply(); });
    },
    notes: ['전체 26개 프로젝트입니다. STRUCTURE 표시가 있는 11개는 소스 구조를 분석한 프로젝트입니다.'],
  };
}

function slideEnd({ A }) {
  return {
    id: 'end', type: 'end', layout: 'center', title: '끝',
    html: () => `<div class="panel reveal">
      <div class="eyebrow">Next orbit</div>
      <h2 class="display" style="font-size:clamp(48px,7.5vw,120px)">만드는 과정이<br><em>남는</em> 곳.</h2>
      <p class="lead">결과물보다 구조를, 주장보다 기록을. 모든 수치는 ${esc(A.generatedAt)} 기준 로컬 기록과 2026-10-29에 다시 읽은 소스 코드에서 왔습니다.</p>
      <div class="chips" style="justify-content:center"><button type="button" class="chip hue" data-go-to="0">처음부터 다시</button><button type="button" class="chip" data-go-to="universe">프로젝트 우주</button><button type="button" class="chip" data-go-to="index">전체 목록</button></div>
    </div>`,
    view: { fit: { w: 40, h: 30 }, dir: [0, .1, 1], target: [0, 0, 0] },
    build: ({ P }) => {
      const g = new THREE.Group();
      g.add(core(LIME, 1.4));
      g.add(satellites(Object.values(P), 18, null, false));
      g.add(starCloud(LIME, 700, 40));
      return genericApi(g);
    },
    notes: ['감사합니다. 질문 받겠습니다.'],
  };
}
