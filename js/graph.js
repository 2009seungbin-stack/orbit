import { THREE, gsap, label, loadTex } from './world.js';

/* ---------- node card texture ---------- */
const PX = 3;               // canvas px per world unit * 100
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function fitText(ctx, text, max) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 2 && ctx.measureText(t + '…').width > max) t = t.slice(0, -1);
  return t + '…';
}

export function cardTexture({ title, sub = '', tag = '', color = '#d4ff3a', w = 6.4, h = 1.9, kind = 'card' }) {
  const cw = Math.round(w * 100 * PX / 2.4), ch = Math.round(h * 100 * PX / 2.4);
  const c = document.createElement('canvas');
  c.width = cw; c.height = ch;
  const x = c.getContext('2d');
  const r = kind === 'pill' ? ch / 2 : 26;
  roundRect(x, 3, 3, cw - 6, ch - 6, r);
  const g = x.createLinearGradient(0, 0, cw, ch);
  g.addColorStop(0, 'rgba(18,24,34,0.96)'); g.addColorStop(1, 'rgba(9,12,18,0.96)');
  x.fillStyle = g; x.fill();
  x.lineWidth = 3; x.strokeStyle = 'rgba(255,255,255,0.10)'; x.stroke();
  // accent bar
  if (kind !== 'pill') {
    x.save(); roundRect(x, 3, 3, cw - 6, ch - 6, r); x.clip();
    x.fillStyle = color; x.fillRect(3, 3, 9, ch);
    x.restore();
  }
  const pad = kind === 'pill' ? ch * .45 : 40;
  const titleSize = Math.round(ch * (sub ? .33 : .42));
  x.textBaseline = 'alphabetic';
  if (tag) {
    x.font = `500 ${Math.round(ch * .15)}px "JetBrains Mono", monospace`;
    x.fillStyle = color;
    x.textAlign = 'right';
    x.fillText(tag, cw - 40, ch * .27);
    x.textAlign = 'left';
  }
  x.fillStyle = '#e4e9f0';
  x.font = `650 ${titleSize}px "Pretendard Variable", Pretendard, sans-serif`;
  if (kind === 'pill') x.textAlign = 'center';
  const tx = kind === 'pill' ? cw / 2 : pad;
  const maxW = cw - pad * 2 - (tag ? ch * .7 : 0);
  if (sub) {
    x.fillText(fitText(x, title, maxW), tx, ch * .52);
    x.font = `400 ${Math.round(ch * .19)}px "JetBrains Mono", monospace`;
    x.fillStyle = 'rgba(200,210,224,0.66)';
    x.fillText(fitText(x, sub, cw - pad * 2), tx, ch * .8);
  } else {
    x.fillText(fitText(x, title, maxW), tx, ch * .5 + titleSize * .36);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/* ---------- node: textured card + glowing frame ---------- */
export function makeNode({ title, sub, tag, color = '#d4ff3a', w = 6.4, h = 1.9, kind = 'card', data = {} }) {
  const group = new THREE.Group();
  const col = new THREE.Color(color);
  const mat = new THREE.MeshBasicMaterial({ map: cardTexture({ title, sub, tag, color, w, h, kind }), transparent: true, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.renderOrder = 2;
  group.add(mesh);
  // glow frame
  const shape = new THREE.Shape();
  const r = kind === 'pill' ? h / 2 : .22, hw = w / 2 + .06, hh = h / 2 + .06;
  shape.moveTo(-hw + r, -hh); shape.lineTo(hw - r, -hh); shape.quadraticCurveTo(hw, -hh, hw, -hh + r);
  shape.lineTo(hw, hh - r); shape.quadraticCurveTo(hw, hh, hw - r, hh); shape.lineTo(-hw + r, hh);
  shape.quadraticCurveTo(-hw, hh, -hw, hh - r); shape.lineTo(-hw, -hh + r); shape.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
  const pts = shape.getPoints(10);
  const fg = new THREE.BufferGeometry().setFromPoints(pts.map(p => new THREE.Vector3(p.x, p.y, 0)));
  const fmat = new THREE.LineBasicMaterial({ color: col.clone().multiplyScalar(2.6), transparent: true, opacity: 0 });
  const frame = new THREE.LineLoop(fg, fmat);
  group.add(frame);
  // back plate gives depth when viewed at an angle
  const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .05, depthWrite: false }));
  back.position.z = -.35;
  group.add(back);

  mesh.userData = { node: group, ...data };
  group.userData = { mesh, mat, frame, fmat, back, color: col, w, h, state: 'idle', ...data };
  group.setState = (s, instant) => setNodeState(group, s, instant);
  return group;
}

function setNodeState(n, s, instant) {
  const u = n.userData;
  if (u.state === s) return;
  u.state = s;
  const look = { idle: [1, 0, 0, .05], dim: [.42, 0, 0, .02], on: [1, 1, .55, .14], hot: [1, .55, .25, .09] }[s] || [1, 0, 0, .05];
  const d = instant ? 0 : .5;
  gsap.to(u.mat, { opacity: look[0], duration: d });
  gsap.to(u.fmat, { opacity: look[1], duration: d });
  gsap.to(u.mesh.position, { z: look[2], duration: d, ease: 'power2.out' });
  gsap.to(u.back.material, { opacity: look[3], duration: d });
}

/* ---------- edges with flowing particles ---------- */
const flowMat = () => new THREE.ShaderMaterial({
  uniforms: { uPR: { value: Math.min(devicePixelRatio, 2) } },
  vertexShader: `attribute float a; attribute vec3 color; varying float vA; varying vec3 vC; uniform float uPR;
    void main(){ vA=a; vC=color; vec4 mv=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mv; gl_PointSize=uPR*(26./-mv.z)*7.; }`,
  fragmentShader: `varying float vA; varying vec3 vC; void main(){ float d=length(gl_PointCoord-.5); if(d>.5) discard;
    float core=smoothstep(.5,.0,d); gl_FragColor=vec4(vC*(1.5+core*2.),core*vA); }`,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
});

export class FlowNet {
  constructor(color) {
    this.group = new THREE.Group();
    this.edges = [];
    this.color = new THREE.Color(color);
    this.perEdge = 4;
  }
  add(curve, { color, label: text, dashed = false, weight = 1, data = {} } = {}) {
    const col = new THREE.Color(color || this.color);
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 48, .028 * weight, 6, false),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: dashed ? .22 : .38, depthWrite: false }),
    );
    this.group.add(tube);
    // arrow head
    const end = curve.getPointAt(1), tan = curve.getTangentAt(.985);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(.13 * weight, .42 * weight, 10), new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(1.6), transparent: true, opacity: .8 }));
    cone.position.copy(end).addScaledVector(tan, -.24);
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan);
    this.group.add(cone);
    let lab = null;
    if (text) {
      lab = label(text, 'flow');
      lab.position.copy(curve.getPointAt(.5)).add(new THREE.Vector3(0, .38, .2));
      this.group.add(lab);
    }
    const samples = curve.getSpacedPoints(80);
    const e = { curve, tube, cone, lab, samples, col, speed: .16 + Math.random() * .06, offset: Math.random(), active: 1, data };
    this.edges.push(e);
    return e;
  }
  finalize() {
    const n = this.edges.length * this.perEdge;
    this.pos = new Float32Array(n * 3);
    this.alpha = new Float32Array(n);
    const col = new Float32Array(n * 3);
    this.edges.forEach((e, i) => { for (let k = 0; k < this.perEdge; k++) col.set([e.col.r, e.col.g, e.col.b], (i * this.perEdge + k) * 3); });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('a', new THREE.BufferAttribute(this.alpha, 1));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.points = new THREE.Points(g, flowMat());
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    this.group.add(this.points);
  }
  setFocus(fn, instant) {
    // fn(edge) -> 'on' | 'dim' | 'idle'
    for (const e of this.edges) {
      const s = fn ? fn(e) : 'idle';
      e.target = s === 'dim' ? .12 : s === 'on' ? 1.6 : 1;
      const op = s === 'dim' ? .07 : s === 'on' ? .85 : .38;
      if (instant) { e.tube.material.opacity = op; e.active = e.target; }
      else gsap.to(e.tube.material, { opacity: op, duration: .5 });
      gsap.to(e.cone.material, { opacity: s === 'dim' ? .15 : .85, duration: instant ? 0 : .5 });
      if (e.lab) { e.lab.element.classList.toggle('hot', s === 'on'); e.lab.element.style.opacity = s === 'dim' ? .15 : ''; }
    }
  }
  showLabels(on) { for (const e of this.edges) e.lab?.element.classList.toggle('on', on); }
  update(t, dt) {
    if (!this.points) return;
    let j = 0;
    for (const e of this.edges) {
      e.active += ((e.target ?? 1) - e.active) * .08;
      const N = e.samples.length - 1;
      for (let k = 0; k < this.perEdge; k++, j++) {
        const u = (t * e.speed * (e.active > 1.2 ? 1.8 : 1) + e.offset + k / this.perEdge) % 1;
        const f = u * N, i0 = f | 0, a = e.samples[i0], b = e.samples[Math.min(i0 + 1, N)], m = f - i0;
        this.pos[j * 3] = a.x + (b.x - a.x) * m; this.pos[j * 3 + 1] = a.y + (b.y - a.y) * m; this.pos[j * 3 + 2] = a.z + (b.z - a.z) * m;
        this.alpha[j] = Math.min(1, Math.sin(u * Math.PI) * 1.4) * Math.min(e.active, 1.4) * .9;
      }
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.a.needsUpdate = true;
  }
}

function bezier(a, b, bend = 0, lift = 0) {
  const dx = b.x - a.x;
  const c1 = new THREE.Vector3(a.x + dx * .45, a.y + bend, a.z + lift);
  const c2 = new THREE.Vector3(b.x - dx * .45, b.y + bend, b.z + lift);
  return new THREE.CubicBezierCurve3(a, c1, c2, b);
}

/* ---------- architecture graph ---------- */
export function buildGraph(spec, { color = '#d4ff3a', colW = 9, rowH = 3.3, curve = 1.6, onPick } = {}) {
  const group = new THREE.Group();
  const mods = spec.modules;
  const cols = Math.max(...mods.map(m => m.col)) + 1;
  const byCol = Array.from({ length: cols }, () => []);
  mods.forEach(m => byCol[m.col].push(m));
  byCol.forEach(list => list.sort((a, b) => a.row - b.row));
  const nodes = new Map();
  mods.forEach(m => {
    const list = byCol[m.col];
    const rows = Math.max(...list.map(x => x.row)) + 1;
    const cx = m.col - (cols - 1) / 2;
    const zoneCol = m.zone === 1 ? '#c3cad4' : color;
    const n = makeNode({ title: m.label, sub: m.path, tag: m.tag || '', color: zoneCol, w: 6.9, h: 2.35, data: { mod: m } });
    n.position.set(cx * colW, ((rows - 1) / 2 - m.row) * rowH, -(Math.abs(cx) ** 1.5) * curve);
    n.rotation.y = -cx * .07;
    group.add(n);
    nodes.set(m.id, n);
  });
  const net = new FlowNet(color);
  const edgeMap = [];
  spec.flows.forEach((f, i) => {
    const A = nodes.get(f.from), B = nodes.get(f.to);
    if (!A || !B) { console.warn('flow ref', f); return; }
    const forward = B.position.x >= A.position.x - .1;
    const same = Math.abs(B.position.x - A.position.x) < .1;
    let a, b, c;
    if (same) {
      const up = B.position.y > A.position.y ? 1 : -1;
      a = A.position.clone().add(new THREE.Vector3(A.userData.w / 2 - .6, up * A.userData.h / 2, .1));
      b = B.position.clone().add(new THREE.Vector3(B.userData.w / 2 - .6, -up * B.userData.h / 2, .1));
      c = new THREE.CubicBezierCurve3(a, a.clone().add(new THREE.Vector3(1.6, up * .6, .6)), b.clone().add(new THREE.Vector3(1.6, -up * .6, .6)), b);
    } else if (forward) {
      a = A.position.clone().add(new THREE.Vector3(A.userData.w / 2 + .05, 0, 0));
      b = B.position.clone().add(new THREE.Vector3(-B.userData.w / 2 - .08, 0, 0));
      c = bezier(a, b, 0, .4);
    } else {
      a = A.position.clone().add(new THREE.Vector3(0, -A.userData.h / 2 - .05, 0));
      b = B.position.clone().add(new THREE.Vector3(0, -B.userData.h / 2 - .08, 0));
      const low = Math.min(a.y, b.y) - 2.2;
      c = new THREE.CubicBezierCurve3(a, new THREE.Vector3(a.x, low, a.z + 1.5), new THREE.Vector3(b.x, low, b.z + 1.5), b);
    }
    const e = net.add(c, { label: f.label, dashed: f.dashed, data: { flow: f, i } });
    edgeMap.push(e);
  });
  net.finalize();
  group.add(net.group);

  // zones: dashed frames around column ranges
  (spec.zones || []).forEach(z => {
    const ns = mods.filter(m => z.cols.includes(m.col)).map(m => nodes.get(m.id));
    if (!ns.length) return;
    const box = new THREE.Box3();
    ns.forEach(n => box.expandByPoint(n.position.clone().add(new THREE.Vector3(-n.userData.w / 2, -n.userData.h / 2, 0))).expandByPoint(n.position.clone().add(new THREE.Vector3(n.userData.w / 2, n.userData.h / 2, 0))));
    const p = .7, y0 = box.min.y - p, y1 = box.max.y + p + .5, x0 = box.min.x - p, x1 = box.max.x + p, zz = box.min.z - .8;
    const g = new THREE.BufferGeometry().setFromPoints([[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]].map(([x, y]) => new THREE.Vector3(x, y, zz)));
    const line = new THREE.Line(g, new THREE.LineDashedMaterial({ color: 0x8fa0b8, dashSize: .35, gapSize: .25, transparent: true, opacity: .35 }));
    line.computeLineDistances();
    group.add(line);
    const l = label(z.label, 'zone');
    l.center.set(0, 1);
    l.position.set(x0 + .1, y1 + .05, zz);
    group.add(l);
    (group.userData.zoneLabels ||= []).push(l);
  });

  const api = {
    group, nodes, net, edges: edgeMap,
    update: (t, dt) => net.update(t, dt),
    reset() {
      nodes.forEach(n => n.setState('idle'));
      net.setFocus(null);
    },
    focusFlow(i) {
      const f = spec.flows[i];
      if (!f) return api.reset();
      nodes.forEach((n, id) => n.setState(id === f.from || id === f.to ? (id === f.to ? 'on' : 'hot') : 'dim'));
      net.setFocus(e => (e.data.i === i ? 'on' : 'dim'));
    },
    focusNode(id) {
      if (!id) return api.reset();
      const linked = new Set([id]);
      spec.flows.forEach(f => { if (f.from === id) linked.add(f.to); if (f.to === id) linked.add(f.from); });
      nodes.forEach((n, nid) => n.setState(nid === id ? 'on' : linked.has(nid) ? 'idle' : 'dim'));
      net.setFocus(e => (e.data.flow.from === id || e.data.flow.to === id ? 'on' : 'dim'));
    },
    labels(on) {
      net.showLabels(on);
      (group.userData.zoneLabels || []).forEach(l => l.element.classList.toggle('on', on));
    },
    pickables: [...nodes.values()].map(n => n.userData.mesh),
  };
  api.pickables.forEach(m => { m.userData.onClick = () => onPick?.(m.userData.mod); m.userData.tip = m.userData.mod; });
  const bb = new THREE.Box3().setFromObject(group);
  api.size = bb.getSize(new THREE.Vector3());
  return api;
}

/* ---------- loop ring / pipeline arc ---------- */
export function buildRing(stages, { color = '#d4ff3a', closed = true, hub = '', radius, small = false, onPick } = {}) {
  const group = new THREE.Group();
  const n = stages.length;
  const R = radius || Math.max(8, n * (small ? 1.25 : 1.6));
  const nodes = [];
  const pts = [];
  const W = small ? 5.4 : 7, H = small ? 1.5 : 2.1;
  for (let i = 0; i < n; i++) {
    let p;
    if (closed) {
      const a = Math.PI / 2 - i / n * Math.PI * 2;
      p = new THREE.Vector3(Math.cos(a) * R * 1.4, Math.sin(a) * R * .88, Math.sin(a) * -2.2);
    } else {
      const span = Math.min(n - 1, 7);
      const u = n === 1 ? 0 : i / (n - 1) - .5;
      const row = n > 7 ? (i < Math.ceil(n / 2) ? 0 : 1) : 0;
      if (n > 7) {
        const k = row ? i - Math.ceil(n / 2) : i, m = row ? n - Math.ceil(n / 2) : Math.ceil(n / 2);
        const uu = m === 1 ? 0 : (row ? 1 - k / (m - 1) : k / (m - 1)) - .5;
        p = new THREE.Vector3(uu * (m - 1) * (small ? 6.4 : 8.4), row ? -2.8 : 2.8, -(uu * uu) * 18 + (row ? -1.2 : 0));
      } else p = new THREE.Vector3(u * span * (small ? 6.4 : 8.4), Math.sin(u * Math.PI) * .6, -(u * u) * 16);
    }
    pts.push(p);
    const s = stages[i];
    const node = makeNode({ title: s.label, sub: s.module || '', tag: String(i + 1).padStart(2, '0'), color, w: W, h: H, kind: small ? 'pill' : 'card', data: { stage: s, i } });
    node.position.copy(p);
    if (!closed) node.rotation.y = -p.x * .012;
    group.add(node);
    nodes.push(node);
  }
  const net = new FlowNet(color);
  net.perEdge = 3;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const A = pts[i], B = pts[(i + 1) % n];
    const dir = B.clone().sub(A).normalize();
    const a = A.clone().addScaledVector(dir, (Math.abs(dir.x) > .6 ? W / 2 : H / 2 + .2) + .1);
    const b = B.clone().addScaledVector(dir, -((Math.abs(dir.x) > .6 ? W / 2 : H / 2 + .2) + .25));
    let c;
    if (closed) {
      const mid = a.clone().add(b).multiplyScalar(.5);
      mid.add(mid.clone().setZ(0).normalize().multiplyScalar(1.4));
      mid.z += .8;
      c = new THREE.QuadraticBezierCurve3(a, mid, b);
    } else if (Math.abs(B.y - A.y) > 2) {
      c = new THREE.CubicBezierCurve3(A.clone().add(new THREE.Vector3(W / 2 + .1, 0, 0)), A.clone().add(new THREE.Vector3(W / 2 + 2.5, 0, .5)), B.clone().add(new THREE.Vector3(W / 2 + 2.5, 0, .5)), B.clone().add(new THREE.Vector3(W / 2 + .2, 0, 0)));
    } else c = bezier(a, b, .0, .5);
    net.add(c, { data: { i } });
  }
  net.finalize();
  group.add(net.group);

  // traveling orb
  const orb = new THREE.Mesh(new THREE.SphereGeometry(small ? .2 : .28, 20, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(3) }));
  orb.position.copy(pts[0]).add(new THREE.Vector3(0, H / 2 + .55, .3));
  group.add(orb);
  const halo = new THREE.Mesh(new THREE.RingGeometry(.42, .5, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2), transparent: true, opacity: .6, side: THREE.DoubleSide }));
  orb.add(halo);

  if (closed && hub) {
    const torus = new THREE.Mesh(new THREE.TorusGeometry(R * .42, .03, 8, 120), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.4), transparent: true, opacity: .5 }));
    group.add(torus);
    const torus2 = new THREE.Mesh(new THREE.TorusGeometry(R * .34, .012, 6, 120), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .18 }));
    group.add(torus2);
    const hubNode = makeNode({ title: hub, color, w: 6.4, h: 1.5, kind: 'pill' });
    hubNode.position.z = -.4;
    group.add(hubNode);
    group.userData.spin = [torus, torus2];
  }

  let cur = -1;
  const api = {
    group, nodes, net, closed,
    update(t, dt) {
      net.update(t, dt);
      halo.rotation.z = t;
      halo.scale.setScalar(1 + Math.sin(t * 3) * .12);
      if (group.userData.spin) { group.userData.spin[0].rotation.z = t * .15; group.userData.spin[1].rotation.z = -t * .1; }
    },
    setStep(i, instant) {
      if (i < 0) {
        cur = -1;
        nodes.forEach(n => n.setState('idle', instant));
        net.setFocus(null, instant);
        return;
      }
      const prev = cur;
      cur = i;
      nodes.forEach((n, k) => n.setState(k === i ? 'on' : k < i ? 'idle' : 'dim', instant));
      net.setFocus(e => (e.data.i === i - 1 || (closed && i === 0 && e.data.i === n - 1) ? 'on' : e.data.i < i ? 'idle' : 'dim'), instant);
      const to = pts[i].clone().add(new THREE.Vector3(0, H / 2 + .55, .3));
      if (instant || prev < 0) { orb.position.copy(to); return; }
      const from = orb.position.clone();
      const mid = from.clone().add(to).multiplyScalar(.5).add(new THREE.Vector3(0, 1.8, 1.4));
      const path = new THREE.QuadraticBezierCurve3(from, mid, to);
      const o = { u: 0 };
      gsap.to(o, { u: 1, duration: .75, ease: 'power2.inOut', onUpdate: () => orb.position.copy(path.getPoint(o.u)) });
    },
    pickables: nodes.map(n => n.userData.mesh),
    points: pts,
  };
  api.pickables.forEach(m => { m.userData.onClick = () => onPick?.(m.userData.i); m.userData.tip = { label: m.userData.stage.label, desc: m.userData.stage.desc, path: m.userData.stage.module }; });
  return api;
}

/* ---------- image plane with frame ---------- */
export function imagePlane(src, { w = 16, aspect = 16 / 9, color = '#ffffff', opacity = 1 } = {}) {
  const h = w / aspect;
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  group.add(mesh);
  loadTex(src).then(t => { if (t) { mat.map = t; mat.color.setScalar(.8); mat.needsUpdate = true; } });
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(w + .08, h + .08)), new THREE.LineBasicMaterial({ color, transparent: true, opacity: .25 }));
  group.add(edge);
  // corner ticks
  const tk = [];
  const s = Math.min(w, h) * .06;
  [[-1, 1], [1, 1], [1, -1], [-1, -1]].forEach(([sx, sy]) => {
    const x = sx * (w / 2 + .35), y = sy * (h / 2 + .35);
    tk.push(new THREE.Vector3(x, y, 0), new THREE.Vector3(x - sx * s, y, 0), new THREE.Vector3(x, y, 0), new THREE.Vector3(x, y - sy * s, 0));
  });
  group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(tk), new THREE.LineBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2), transparent: true, opacity: .7 })));
  group.userData = { mesh, mat, w, h };
  return group;
}

/* ---------- media: image or muted looping video on a plane ---------- */
const videos = new Set();
export function pauseAllVideos() { videos.forEach(v => v.pause()); }

export function mediaTexture(shot) {
  if (shot.kind !== 'video') return loadTex(shot.src).then(t => ({ tex: t }));
  const v = document.createElement('video');
  Object.assign(v, { src: shot.src, muted: true, loop: true, playsInline: true, preload: 'auto', crossOrigin: 'anonymous' });
  v.setAttribute('muted', '');
  videos.add(v);
  const tex = new THREE.VideoTexture(v);
  tex.colorSpace = THREE.SRGBColorSpace;
  return Promise.resolve({ tex, video: v });
}

// a framed screen that can swap between shots with a crossfade
export function screenSwap({ w = 24, maxH = 15, color = '#ffffff' } = {}) {
  const group = new THREE.Group();
  const mk = () => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x0b0f16, transparent: true, opacity: 0, depthWrite: false }));
    group.add(m);
    return m;
  };
  const A = mk(), B = mk();
  B.position.z = .02;
  const frameMat = new THREE.LineBasicMaterial({ color: new THREE.Color(color).multiplyScalar(2.2), transparent: true, opacity: .8 });
  const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1)), frameMat);
  frame.position.z = .03;
  group.add(frame);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: .55, depthWrite: false }));
  glow.position.z = -.4;
  group.add(glow);
  const cap = label('', 'screen-cap');
  cap.center.set(.5, 0);
  group.add(cap);
  let front = A, back = B, token = 0, curVideo = null;
  const size = { w, h: w * 9 / 16 };
  const fitTo = (aspect) => {
    let ww = w, hh = w / aspect;
    if (hh > maxH) { hh = maxH; ww = hh * aspect; }
    return [ww, hh];
  };
  const api = {
    group, size,
    async show(shot, instant) {
      const my = ++token;
      if (!shot) return;
      const { tex, video } = await mediaTexture(shot);
      if (my !== token || !tex) return;
      const aspect = (shot.width && shot.height) ? shot.width / shot.height : 16 / 9;
      const [ww, hh] = fitTo(aspect);
      size.w = ww; size.h = hh;
      [back, front] = [front, back];
      front.material.map = tex;
      front.material.color.setScalar(.82);
      front.material.needsUpdate = true;
      front.scale.set(ww, hh, 1);
      front.position.z = .02; back.position.z = 0;
      curVideo?.pause();
      curVideo = video || null;
      video?.play().catch(() => {});
      gsap.to(front.material, { opacity: 1, duration: instant ? 0 : .6 });
      gsap.to(back.material, { opacity: 0, duration: instant ? 0 : .6 });
      gsap.to(frame.scale, { x: ww + .12, y: hh + .12, duration: instant ? 0 : .6, ease: 'power2.inOut' });
      gsap.to(glow.scale, { x: ww + 2.4, y: hh + 2.4, duration: instant ? 0 : .6 });
      cap.position.set(0, -hh / 2 - .8, 0);
      cap.element.innerHTML = `<b>${escHTML(shot.title)}</b>${shot.version ? `<span>${escHTML(shot.version)}</span>` : ''}`;
    },
    play() { curVideo?.play().catch(() => {}); },
    pause() { curVideo?.pause(); },
    mesh: () => front,
  };
  frame.scale.set(w, w * 9 / 16, 1);
  return api;
}
const escHTML = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- glowing ring decoration ---------- */
export function orbitRings(color, r = 6) {
  const g = new THREE.Group();
  const c = new THREE.Color(color);
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(new THREE.TorusGeometry(r * (1 + i * .32), i ? .012 : .03, 8, 160), new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(i ? 1 : 2.2), transparent: true, opacity: i ? .3 : .8 }));
    m.rotation.set(Math.PI / 2 + (i - 1) * .35, i * .4, 0);
    g.add(m);
  }
  return g;
}
