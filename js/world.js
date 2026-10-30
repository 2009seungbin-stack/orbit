import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const gsap = window.gsap;
const BG = 0x05070b;

export const isMobile = () => matchMedia('(max-width: 900px)').matches;
export const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

export class World {
  constructor(canvas, labelLayer) {
    this.canvas = canvas;
    const renderer = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setClearColor(BG, 1);
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(BG, 0.0042);
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 3000);

    this.labels = new CSS2DRenderer({ element: labelLayer });
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.5, 0.86);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.useBloom = !isMobile();

    // camera rig: view.pos/target are tweened; look offsets come from drag / parallax
    this.view = { pos: new THREE.Vector3(0, 30, 400), target: new THREE.Vector3(), lift: 0, fov: 40 };
    this.focus = { x: 0, y: 0 };
    this.parallax = new THREE.Vector2();
    this.pointer = new THREE.Vector2(-9, -9);
    this.look = { yaw: 0, pitch: 0, tYaw: 0, tPitch: 0, dist: 1, tDist: 1 };
    this.ticks = new Set();
    this.objects = [];   // { group, center, radius }
    this.pickables = [];
    this.raycaster = new THREE.Raycaster();
    this.clock = new THREE.Clock();
    this.time = 0;
    this.hovered = null;

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(40, 80, 60);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x88aaff, 0.6);
    rim.position.set(-60, 20, -40);
    this.scene.add(rim);

    this.buildBackdrop();
    this.bindInput();
    this.resize();
    addEventListener('resize', () => this.resize());
    this.frameTimes = [];
  }

  /* ---------- backdrop: stars, dust, grid ---------- */
  buildBackdrop() {
    const n = isMobile() ? 2200 : 5200;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n);
    const tint = [new THREE.Color('#ffffff'), new THREE.Color('#cfe0ff'), new THREE.Color('#ffe9c7'), new THREE.Color('#d4ff3a')];
    for (let i = 0; i < n; i++) {
      const r = 600 + Math.random() * 1400;
      const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      pos.set([r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph) * .6, r * Math.sin(ph) * Math.sin(th)], i * 3);
      const c = tint[Math.random() < .04 ? 3 : (Math.random() * 3) | 0];
      col.set([c.r, c.g, c.b], i * 3);
      size[i] = Math.random() < .03 ? 3.2 : .6 + Math.random() * 1.4;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('size', new THREE.BufferAttribute(size, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPR: { value: Math.min(devicePixelRatio, 2) } },
      vertexShader: `attribute float size; attribute vec3 color; varying vec3 vC; varying float vA; uniform float uTime; uniform float uPR;
        void main(){ vC=color; vec4 mv=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mv;
        float tw=.65+.35*sin(uTime*1.3+position.x*.05+position.y*.07); vA=tw; gl_PointSize=size*uPR*(1.+step(2.,size)*.6); }`,
      fragmentShader: `varying vec3 vC; varying float vA; void main(){ vec2 p=gl_PointCoord-.5; float d=length(p); if(d>.5) discard;
        float a=smoothstep(.5,0.,d); gl_FragColor=vec4(vC*1.2,a*vA*.9); }`,
      transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
    });
    this.stars = new THREE.Points(g, m);
    this.stars.frustumCulled = false;
    this.scene.add(this.stars);

    // infinite-feel grid floor that follows the camera
    const gm = new THREE.ShaderMaterial({
      uniforms: { uCam: { value: new THREE.Vector3() }, uColor: { value: new THREE.Color('#2a3444') }, uAccent: { value: new THREE.Color('#d4ff3a') } },
      vertexShader: `varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `varying vec3 vW; uniform vec3 uCam; uniform vec3 uColor; uniform vec3 uAccent;
        float grid(vec2 p,float s){ vec2 g=abs(fract(p/s-.5)-.5)/fwidth(p/s); return 1.-min(min(g.x,g.y),1.); }
        void main(){ float d=length(vW.xz-uCam.xz); float fade=exp(-d*.0065);
          float g1=grid(vW.xz,4.)*.35, g2=grid(vW.xz,40.)*.9;
          vec3 c=mix(uColor,uAccent,g2*.12); gl_FragColor=vec4(c,(g1+g2)*fade*.55); }`,
      transparent: true, depthWrite: false, extensions: { derivatives: true },
    });
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), gm);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = -26;
    this.scene.add(this.floor);

    // drifting dust near camera
    const dn = isMobile() ? 300 : 900;
    const dp = new Float32Array(dn * 3);
    for (let i = 0; i < dn; i++) dp.set([(Math.random() - .5) * 220, (Math.random() - .5) * 120, (Math.random() - .5) * 220], i * 3);
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
    this.dust = new THREE.Points(dg, new THREE.ShaderMaterial({
      uniforms: { uPR: { value: Math.min(devicePixelRatio, 2) } },
      vertexShader: `uniform float uPR; varying float vA; void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mv;
        float s=60./-mv.z; vA=smoothstep(2.,12.,-mv.z); gl_PointSize=clamp(s,0.,2.6)*uPR; }`,
      fragmentShader: `varying float vA; void main(){ float d=length(gl_PointCoord-.5); if(d>.5) discard; gl_FragColor=vec4(.56,.64,.75,(1.-d*2.)*.5*vA); }`,
      transparent: true, depthWrite: false,
    }));
    this.dust.frustumCulled = false;
    this.scene.add(this.dust);
  }

  /* ---------- input: parallax, drag-to-look, hover/click picking ---------- */
  bindInput() {
    const c = this.canvas;
    let drag = null;
    c.addEventListener('pointermove', e => {
      this.parallax.set(e.clientX / innerWidth - .5, e.clientY / innerHeight - .5);
      this.pointer.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      this.pointerPx = [e.clientX, e.clientY];
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
        this.look.tYaw = drag.yaw - dx * .005;
        this.look.tPitch = THREE.MathUtils.clamp(drag.pitch - dy * .004, -.6, .5);
        if (drag.moved) document.body.classList.add('dragging');
      }
    });
    c.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      if (e.pointerType === 'touch') {
        // touch: tap picks, swipes are handled by the deck
        this.pointer.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
        this.pointerPx = [e.clientX, e.clientY];
        this.tap = { x: e.clientX, y: e.clientY };
        return;
      }
      drag = { x: e.clientX, y: e.clientY, yaw: this.look.tYaw, pitch: this.look.tPitch, moved: false };
      c.setPointerCapture(e.pointerId);
    });
    const end = e => {
      if (this.tap && e.type === 'pointerup') {
        const far = Math.hypot(e.clientX - this.tap.x, e.clientY - this.tap.y) > 10;
        this.tap = null;
        if (!far) { this.pick(); this.hovered?.userData.onClick?.(this.hovered); }
        return;
      }
      if (!drag) return;
      const moved = drag.moved;
      drag = null;
      document.body.classList.remove('dragging');
      if (!moved && e.type === 'pointerup' && this.hovered?.userData.onClick) this.hovered.userData.onClick(this.hovered);
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('pointerleave', () => { this.pointer.set(-9, -9); this.setHover(null); });
    c.addEventListener('dblclick', () => this.resetLook());
    c.addEventListener('wheel', e => {
      if (!e.ctrlKey && !e.altKey) return;
      e.preventDefault();
      this.look.tDist = THREE.MathUtils.clamp(this.look.tDist * (1 + Math.sign(e.deltaY) * .08), .55, 1.6);
    }, { passive: false });
  }

  resetLook() { this.look.tYaw = 0; this.look.tPitch = 0; this.look.tDist = 1; }

  setHover(obj) {
    if (this.hovered === obj) return;
    this.hovered?.userData.onHover?.(false, this.hovered);
    this.hovered = obj;
    obj?.userData.onHover?.(true, obj);
    this.onHoverAny?.(obj);
    this.canvas.style.cursor = obj?.userData.onClick ? 'pointer' : '';
  }

  pick() {
    if (this.pointer.x < -2 || !this.pickables.length) return this.setHover(null);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const live = this.pickables.filter(o => o.visible && isShown(o));
    const hit = this.raycaster.intersectObjects(live, false)[0];
    this.setHover(hit ? hit.object : null);
  }

  /* ---------- camera ---------- */
  setFocus(x, y, instant) {
    if (instant || reduceMotion) { this.focus.x = x; this.focus.y = y; return; }
    gsap.to(this.focus, { x, y, duration: 1.4, ease: 'power3.inOut' });
  }

  flyTo(pos, target, { duration = 2.2, arc = 0, fov = 40, instant = false } = {}) {
    gsap.killTweensOf(this.view.pos); gsap.killTweensOf(this.view.target); gsap.killTweensOf(this.view);
    this.resetLook();
    if (instant || reduceMotion) {
      this.view.pos.copy(pos); this.view.target.copy(target); this.view.fov = fov; this.view.lift = 0;
      return Promise.resolve();
    }
    const d = this.view.pos.distanceTo(pos);
    const dur = THREE.MathUtils.clamp(duration * (0.55 + Math.min(d, 600) / 600 * .65), .9, 3.2);
    gsap.to(this.view.pos, { x: pos.x, y: pos.y, z: pos.z, duration: dur, ease: 'power3.inOut' });
    gsap.to(this.view.target, { x: target.x, y: target.y, z: target.z, duration: dur * .92, ease: 'power3.inOut' });
    gsap.to(this.view, { fov, duration: dur, ease: 'power2.inOut' });
    if (arc || d > 120) {
      const lift = arc || Math.min(d * .12, 50);
      gsap.fromTo(this.view, { lift: 0 }, { lift, duration: dur / 2, ease: 'sine.out', yoyo: true, repeat: 1 });
    }
    return new Promise(r => setTimeout(r, dur * 1000));
  }

  /* ---------- registry ---------- */
  add(group, { radius = 60 } = {}) {
    if (!group.parent) this.scene.add(group);
    const entry = { group, radius, center: new THREE.Vector3() };
    group.updateMatrixWorld(true);
    group.getWorldPosition(entry.center);
    this.objects.push(entry);
    return entry;
  }

  onTick(fn) { this.ticks.add(fn); return () => this.ticks.delete(fn); }

  resize() {
    const w = innerWidth, h = innerHeight;
    const pr = Math.min(devicePixelRatio, this.lowPower ? 1.25 : 2);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w / 2, h / 2);
    this.labels.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.w = w; this.h = h;
  }

  start() {
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      if (document.hidden) return;
      this.frame();
    };
    loop();
  }

  frame() {
    const dt = Math.min(this.clock.getDelta(), 1 / 20);
    this.time += dt;
    const t = this.time;
    const v = this.view, L = this.look, cam = this.camera;

    L.yaw += (L.tYaw - L.yaw) * .08; L.pitch += (L.tPitch - L.pitch) * .08; L.dist += (L.tDist - L.dist) * .08;
    this._p ??= new THREE.Vector2();
    this._p.lerp(this.parallax, .04);

    // orbit the camera around its target by the drag offsets
    const off = v.pos.clone().sub(v.target);
    const sph = new THREE.Spherical().setFromVector3(off);
    sph.theta += L.yaw - this._p.x * .06;
    sph.phi = THREE.MathUtils.clamp(sph.phi + L.pitch - this._p.y * .04, .15, Math.PI - .15);
    sph.radius *= L.dist;
    cam.position.copy(v.target).add(new THREE.Vector3().setFromSpherical(sph));
    cam.position.y += v.lift;
    cam.lookAt(v.target.x, v.target.y + v.lift * .35, v.target.z);
    if (Math.abs(cam.fov - v.fov) > .01 || this._fx !== this.focus.x || this._fy !== this.focus.y) {
      cam.fov = v.fov;
      this._fx = this.focus.x; this._fy = this.focus.y;
      cam.setViewOffset(this.w, this.h, -this.focus.x * this.w, -this.focus.y * this.h, this.w, this.h);
      cam.updateProjectionMatrix();
    }

    // show only nearby stations
    for (const o of this.objects) {
      const near = o.center.distanceTo(cam.position) < o.radius + 260;
      if (o.group.visible !== near) o.group.visible = near;
    }

    this.stars.material.uniforms.uTime.value = t;
    this.stars.position.copy(cam.position).multiplyScalar(.92);
    this.floor.material.uniforms.uCam.value.copy(cam.position);
    this.floor.position.y += (v.target.y - 24 - this.floor.position.y) * .05;
    this.floor.position.x = Math.round(cam.position.x / 40) * 40;
    this.floor.position.z = Math.round(cam.position.z / 40) * 40;
    this.dust.position.set(Math.round(cam.position.x / 110) * 110, cam.position.y, Math.round(cam.position.z / 110) * 110);
    this.dust.rotation.y = t * .01;

    for (const fn of this.ticks) fn(t, dt);
    this.pick();

    if (this.useBloom) this.composer.render(); else this.renderer.render(this.scene, cam);
    this.labels.render(this.scene, cam);
    this.watchPerf(dt);
  }

  watchPerf(dt) {
    if (this.perfDone) return;
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 150) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes.length = 0;
    if (avg > 1 / 34) {
      if (this.useBloom) { this.useBloom = false; }
      else if (!this.lowPower) { this.lowPower = true; this.resize(); this.perfDone = true; }
    } else this.perfDone = true;
  }
}

function isShown(o) {
  for (let p = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}

/* ---------- shared helpers ---------- */
export function label(html, cls = '', css = {}) {
  const el = document.createElement('div');
  el.className = 'lbl ' + cls;
  el.innerHTML = html;
  Object.assign(el.style, css);
  const obj = new CSS2DObject(el);
  obj.center.set(.5, .5);
  return obj;
}

const texLoader = new THREE.TextureLoader();
const texCache = new Map();
export function loadTex(src) {
  if (!texCache.has(src)) {
    texCache.set(src, new Promise(res => texLoader.load(src, t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; res(t); }, undefined, () => res(null))));
  }
  return texCache.get(src);
}

export { THREE, gsap };
