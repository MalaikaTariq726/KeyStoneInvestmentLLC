// Key Stone hero: a steel-frame building that assembles floor by floor,
// topped by a slowly turning tower crane. Rendered inside the light hero panel.
// Loaded lazily from index.html only on capable devices.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const ORANGE = 0xf15a24;
const BLUE = 0x2b3990;
const BG = 0xf3f5fd;

const ease = (t) => 1 - Math.pow(1 - t, 3);
const clamp01 = (t) => Math.min(Math.max(t, 0), 1);

export function initHero(container) {
  const panel = container.parentElement;
  const small = () => container.clientWidth < 520;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(BG, 22, 40);
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);

  // Lights: bright daylight
  scene.add(new THREE.HemisphereLight(0xffffff, 0xdfe4f7, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 2.4);
  sun.position.set(6, 12, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 9, bottom: -3, near: 1, far: 30 });
  sun.shadow.radius = 4;
  scene.add(sun);
  const warm = new THREE.PointLight(ORANGE, 18, 16);
  warm.position.set(-4, 2, 4);
  scene.add(warm);

  const world = new THREE.Group();
  scene.add(world);
  const building = new THREE.Group();
  world.add(building);

  // ---------- Steel frame ----------
  const FLOORS = 7, N = 4, BAY = 1.05, FH = 0.78, T = 0.075;
  const half = ((N - 1) * BAY) / 2;
  const parts = [];
  const rand = mulberry32(7);

  for (let f = 0; f < FLOORS; f++) {
    const top = f === FLOORS - 1;
    const y0 = f * FH, y1 = (f + 1) * FH;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const x = i * BAY - half, z = j * BAY - half;
        if (top && rand() < 0.35) continue; // unfinished top floor
        parts.push({ f, start: [x, y0, z], dir: [0, 1, 0], len: FH, t: T * 1.15, d: rand() * 0.25 });
        if (i < N - 1 && !(top && rand() < 0.5)) parts.push({ f, start: [x, y1, z], dir: [1, 0, 0], len: BAY, t: T, d: 0.25 + rand() * 0.25 });
        if (j < N - 1 && !(top && rand() < 0.5)) parts.push({ f, start: [x, y1, z], dir: [0, 0, 1], len: BAY, t: T, d: 0.25 + rand() * 0.25 });
      }
    }
    if (f % 2 === 0 && !top) {
      const L = Math.hypot(BAY, FH);
      parts.push({ f, start: [-half, y0, half], dir: [BAY / L, FH / L, 0], len: L, t: T * 0.8, d: 0.45 });
      parts.push({ f, start: [half, y0, -half], dir: [0, FH / L, BAY / L], len: L, t: T * 0.8, d: 0.45 });
    }
  }

  const steelMat = new THREE.MeshStandardMaterial({ color: BLUE, metalness: 0.35, roughness: 0.45 });
  const steel = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), steelMat, parts.length);
  steel.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  steel.castShadow = true;
  building.add(steel);

  // Floor slabs (concrete-white) and orange joints
  const slabs = [];
  const slabMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, transparent: true, opacity: 0.85 });
  for (let f = 0; f < FLOORS - 1; f++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(half * 2 + 0.22, 0.06, half * 2 + 0.22), slabMat);
    s.position.y = (f + 1) * FH - 0.04;
    s.castShadow = true;
    s.receiveShadow = true;
    s.scale.setScalar(0.0001);
    building.add(s);
    slabs.push(s);
  }

  const jointPos = [];
  for (let f = 0; f < FLOORS - 1; f++)
    for (let i = 0; i < N; i++)
      for (let j = 0; j < N; j++)
        if ((i === 0 || i === N - 1) && (j === 0 || j === N - 1)) jointPos.push([i * BAY - half, (f + 1) * FH, j * BAY - half, f]);
  const joints = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.14, 0.14, 0.14),
    new THREE.MeshStandardMaterial({ color: ORANGE, emissive: ORANGE, emissiveIntensity: 0.35, roughness: 0.4 }),
    jointPos.length
  );
  joints.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  building.add(joints);

  // ---------- Tower crane ----------
  const crane = new THREE.Group();
  const orangeMat = new THREE.MeshStandardMaterial({ color: ORANGE, metalness: 0.2, roughness: 0.45 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1b2150, metalness: 0.3, roughness: 0.5 });
  const mastH = FLOORS * FH + 2.0;
  const mast = new THREE.Mesh(new THREE.BoxGeometry(0.18, mastH, 0.18), orangeMat);
  mast.position.y = mastH / 2;
  mast.castShadow = true;
  crane.add(mast);
  const slew = new THREE.Group();
  slew.position.y = mastH;
  crane.add(slew);
  const jib = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.15, 0.15), orangeMat);
  jib.position.x = 2.1;
  jib.castShadow = true;
  slew.add(jib);
  const counter = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.13, 0.13), orangeMat);
  counter.position.x = -0.8;
  slew.add(counter);
  const weight = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.32, 0.3), darkMat);
  weight.position.set(-1.3, -0.18, 0);
  slew.add(weight);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.26, 0.26), darkMat);
  cab.position.set(0.25, -0.2, 0);
  slew.add(cab);
  const apex = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.7, 4), orangeMat);
  apex.position.y = 0.42;
  slew.add(apex);
  const cableLen = 1.9;
  const cable = new THREE.Mesh(new THREE.BoxGeometry(0.015, cableLen, 0.015), darkMat);
  cable.position.set(3.4, -cableLen / 2, 0);
  slew.add(cable);
  const load = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.08, 0.08), steelMat);
  load.position.set(3.4, -cableLen - 0.06, 0);
  slew.add(load);
  crane.position.set(half + 0.8, 0, -half - 0.25);
  crane.scale.setScalar(0.0001);
  building.add(crane);

  // ---------- Ground ----------
  const ground = new THREE.Mesh(new THREE.CircleGeometry(9, 64), new THREE.ShadowMaterial({ opacity: 0.12 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  world.add(ground);

  const grid = new THREE.GridHelper(16, 32, 0xc5ccea, 0xdde2f3);
  grid.material.transparent = true;
  grid.material.opacity = 0.7;
  grid.position.y = 0.002;
  world.add(grid);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.75, 2.82, 96),
    new THREE.MeshBasicMaterial({ color: ORANGE, transparent: true, opacity: 0.6, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.01;
  world.add(ring);

  // ---------- Layout ----------
  const target = new THREE.Vector3(0, 3.1, 0);
  let radius = 16;
  function layout() {
    const w = container.clientWidth, h = container.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    radius = small() ? 18.5 : 16;
  }
  layout();
  new ResizeObserver(layout).observe(container);

  // ---------- Input ----------
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  window.addEventListener('pointermove', (e) => {
    mouse.tx = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.ty = (e.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });

  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) start(); }).observe(container);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) start(); });

  // ---------- Animate ----------
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0), dirV = new THREE.Vector3();
  const FLOOR_STEP = 0.42;
  const BUILD_END = FLOORS * FLOOR_STEP + 1.4;
  let built = false, first = true, raf = 0, time = 0, buildStart = 0;
  const clock = new THREE.Clock();

  function updateBuild(t) {
    parts.forEach((pt, i) => {
      const k = ease(clamp01((t - pt.f * FLOOR_STEP - pt.d) / 0.55));
      const L = Math.max(pt.len * k, 0.0001);
      dirV.set(pt.dir[0], pt.dir[1], pt.dir[2]);
      p.set(pt.start[0], pt.start[1], pt.start[2]).addScaledVector(dirV, L / 2);
      q.setFromUnitVectors(up, dirV);
      s.set(pt.t, L, pt.t);
      steel.setMatrixAt(i, m.compose(p, q, s));
    });
    steel.instanceMatrix.needsUpdate = true;

    q.identity();
    jointPos.forEach((jp, i) => {
      const k = ease(clamp01((t - jp[3] * FLOOR_STEP - 0.6) / 0.4));
      p.set(jp[0], jp[1], jp[2]);
      s.setScalar(Math.max(k, 0.0001));
      joints.setMatrixAt(i, m.compose(p, q, s));
    });
    joints.instanceMatrix.needsUpdate = true;

    slabs.forEach((sl, f) => sl.scale.setScalar(Math.max(ease(clamp01((t - f * FLOOR_STEP - 0.5) / 0.6)), 0.0001)));
    crane.scale.setScalar(Math.max(ease(clamp01((t - FLOORS * FLOOR_STEP * 0.6) / 0.9)), 0.0001));
    ring.scale.setScalar(0.4 + 0.6 * ease(clamp01(t / 1.2)));
  }

  function frame() {
    raf = 0;
    if (!visible || document.hidden) { clock.stop(); return; }
    if (!clock.running) clock.start();
    time += Math.min(clock.getDelta(), 0.1);

    if (!built) {
      // wall-clock based so the build finishes on time even at low frame rates
      if (!buildStart) buildStart = performance.now();
      const bt = (performance.now() - buildStart) / 1000;
      updateBuild(bt);
      if (bt > BUILD_END) built = true;
    }

    mouse.x += (mouse.tx - mouse.x) * 0.05;
    mouse.y += (mouse.ty - mouse.y) * 0.05;

    building.rotation.y = time * 0.12 + mouse.x * 0.4;
    slew.rotation.y = Math.sin(time * 0.25) * 0.9;
    load.rotation.y = Math.sin(time * 0.6) * 0.3;
    ring.material.opacity = 0.45 + Math.sin(time * 2) * 0.15;

    const a = 0.7 + mouse.x * 0.1;
    camera.position.set(Math.sin(a) * radius, 6.5 - mouse.y * 0.8, Math.cos(a) * radius);
    camera.lookAt(target);

    renderer.render(scene, camera);
    if (first) {
      first = false;
      container.classList.add('is-ready');
      panel.classList.add('has-3d');
    }
    raf = requestAnimationFrame(frame);
  }

  function start() { if (!raf) raf = requestAnimationFrame(frame); }
  start();
}

// deterministic PRNG so the "unfinished" top floor looks the same every visit
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
