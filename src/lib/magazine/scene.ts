// 「見せる」ページめくりの 3D シーン（three.js）。トップとタグページからだけ動的に読み込む。
// 紙の形・時間割・見開きは three.js に依存しない関数（pageShape / schedule / spread）を使う。
// 試作: docs/superpowers/specs/assets/2026-11-08-magazine-prototype.html
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { PAPER, leafOffsets, shapePage, vertexCount } from './pageShape';
import { cycleLength, forwardEnd, leafProgress } from './schedule';
import { buildLeaves, type MagazinePage } from './spread';

export type ShowcaseState = { state: 'TURNING' | 'HOLDING' | 'RIFFLE'; page: number; total: number; rightPageIndex: number };

/** ユーザーが決めた構図: 注視点から見たカメラの相対位置、焦点距離、ぼけ */
const VIEW_OFFSET = new THREE.Vector3(1.34, 2.89, 0.94);
const FOCAL_MM = 44;
const APERTURE = 0.006;
const MAX_BLUR = 0.006;

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** WebGL が使えるか（使えなければ平面表示のまま） */
export function canUseWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** 生成りの紙に作品を余白付きで描いたテクスチャ（作品が無ければ無地の紙） */
function paperTexture(img: HTMLImageElement | null, mirror: boolean, colors: { sheet: string; ink: string; speck: string }): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 900;
  c.height = 1200;
  const g = c.getContext('2d')!;
  g.fillStyle = colors.sheet;
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = colors.speck;
  for (let i = 0; i < 2500; i++) g.fillRect(Math.random() * c.width, Math.random() * c.height, 2, 2);
  if (img) {
    // 余白の中に、本来の縦横比で収める
    const m = 70, boxW = c.width - m * 2, boxH = c.height - m * 2 - 90;
    const scale = Math.min(boxW / img.naturalWidth, boxH / img.naturalHeight);
    const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
    g.drawImage(img, m + (boxW - w) / 2, m + (boxH - h) / 2, w, h);
    g.fillStyle = colors.ink;
    g.font = '22px monospace';
    g.fillText('JUNK JOURNAL JOURNEY', m, c.height - 70);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (mirror) { t.wrapS = THREE.RepeatWrapping; t.repeat.x = -1; }
  return t;
}

function pageGeometry(): THREE.BufferGeometry {
  const { segU, segV } = PAPER;
  const g = new THREE.BufferGeometry();
  const uv = new Float32Array(vertexCount() * 2);
  const idx: number[] = [];
  for (let j = 0; j <= segV; j++) for (let i = 0; i <= segU; i++) {
    const k = j * (segU + 1) + i;
    uv[k * 2] = i / segU;
    uv[k * 2 + 1] = 1 - j / segV;
  }
  for (let j = 0; j < segV; j++) for (let i = 0; i < segU; i++) {
    const a = j * (segU + 1) + i, b = a + 1, c = a + segU + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  g.setIndex(idx);
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertexCount() * 3), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

function updateShape(geo: THREE.BufferGeometry, p: number, offRight: number, offLeft: number, air: number, flutter: number) {
  const attr = geo.attributes.position as THREE.BufferAttribute;
  shapePage(attr.array as Float32Array, p, offRight, offLeft, air, flutter);
  attr.needsUpdate = true;
  geo.computeVertexNormals();
}

export async function createShowcaseScene(
  canvas: HTMLCanvasElement,
  opts: { pages: MagazinePage[]; reducedMotion: boolean; onState?: (s: ShowcaseState) => void },
): Promise<{ dispose(): void }> {
  const colors = {
    paper: cssVar('--paper'), sheet: cssVar('--sheet'), ink: cssVar('--sheet-ink'), speck: cssVar('--sheet-speck'),
    coverInner: cssVar('--cover-inner'), accent: cssVar('--accent'), lineInk: cssVar('--ink'),
    shadow: cssVar('--sheet-shadow'), shadowClear: cssVar('--sheet-shadow-clear'),
    key: cssVar('--light-key'), rim: cssVar('--light-rim'), sky: cssVar('--light-sky'), ground: cssVar('--light-ground'),
  };

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(colors.paper);
  scene.fog = new THREE.Fog(colors.paper, 7, 15);

  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 60);
  camera.setFocalLength(FOCAL_MM);

  scene.add(new THREE.HemisphereLight(colors.sky, colors.ground, 1.6));
  const key = new THREE.DirectionalLight(colors.key, 1.5);
  key.position.set(-2.5, 5, 2);
  scene.add(key);
  const rim = new THREE.DirectionalLight(colors.rim, 0.6);
  rim.position.set(3, 1, -3);
  scene.add(rim);

  // 真下のぼんやりした影
  const blob = document.createElement('canvas');
  blob.width = blob.height = 256;
  {
    const g = blob.getContext('2d')!;
    const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, colors.shadow);
    gr.addColorStop(1, colors.shadowClear);
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 256);
  }
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 3.0), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(blob), transparent: true, depthWrite: false }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -1.6, 0);
  scene.add(ground);

  // 雑誌
  const magazine = new THREE.Group();
  scene.add(magazine);
  const leaves = buildLeaves(opts.pages);
  const images = await Promise.all(opts.pages.map((p) => loadImage(p.src)));
  const imageOf = (page: MagazinePage | null) => (page ? images[opts.pages.indexOf(page)] ?? null : null);

  const leafGeos = leaves.map((leaf) => {
    const geo = pageGeometry();
    const front = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: paperTexture(imageOf(leaf.front), false, colors), side: THREE.FrontSide, roughness: 0.92 }));
    const back = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: paperTexture(imageOf(leaf.back), true, colors), side: THREE.BackSide, roughness: 0.92 }));
    magazine.add(front, back);
    return geo;
  });
  // 表紙: 内側は紙の色、外側（下になる面）だけオレンジ
  const coverIn = new THREE.MeshStandardMaterial({ color: colors.coverInner, roughness: 0.85, side: THREE.DoubleSide });
  const coverOut = new THREE.MeshStandardMaterial({ color: colors.accent, roughness: 0.7, side: THREE.DoubleSide });
  const coverR = new THREE.Mesh(pageGeometry(), coverIn), coverL = new THREE.Mesh(pageGeometry(), coverIn);
  const coverRo = new THREE.Mesh(pageGeometry(), coverOut), coverLo = new THREE.Mesh(pageGeometry(), coverOut);
  magazine.add(coverR, coverL, coverRo, coverLo);
  const g = PAPER.gap;
  updateShape(coverR.geometry, 0, g * 0.5, 0, 0, 0);
  updateShape(coverL.geometry, 1, 0, g * 0.5, 0, 0);
  updateShape(coverRo.geometry, 0, -g * 0.6, 0, 0, 0);
  updateShape(coverLo.geometry, 1, 0, -g * 0.6, 0, 0);

  // 雑誌の下の幾何学アニメーション（オレンジの細い円・破線の円・目盛り）
  const rings = new THREE.Group();
  rings.position.y = -1.05;
  magazine.add(rings);
  const accent = new THREE.Color(colors.accent);
  for (const [r, dashed, opacity] of [[1.5, false, 0.55], [1.95, true, 0.4], [1.0, false, 0.3], [2.5, true, 0.22]] as const) {
    const pts = Array.from({ length: 129 }, (_, a) => new THREE.Vector3(Math.cos((a / 128) * Math.PI * 2) * r, 0, Math.sin((a / 128) * Math.PI * 2) * r));
    const mat = dashed
      ? new THREE.LineDashedMaterial({ color: accent, dashSize: 0.08, gapSize: 0.06, transparent: true, opacity })
      : new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity });
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat);
    if (dashed) line.computeLineDistances();
    line.userData.speed = (dashed ? -1 : 1) * (0.05 + r * 0.03);
    rings.add(line);
  }
  const tickMat = new THREE.LineBasicMaterial({ color: new THREE.Color(colors.lineInk), transparent: true, opacity: 0.25 });
  for (let a = 0; a < 60; a++) {
    const ang = (a / 60) * Math.PI * 2, r0 = 2.15, r1 = a % 5 === 0 ? 2.32 : 2.22;
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(Math.cos(ang) * r0, 0, Math.sin(ang) * r0), new THREE.Vector3(Math.cos(ang) * r1, 0, Math.sin(ang) * r1),
    ]), tickMat);
    l.userData.speed = 0.03;
    rings.add(l);
  }

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bokeh = new BokehPass(scene, camera, { focus: 5, aperture: APERTURE, maxblur: MAX_BLUR });
  composer.addPass(bokeh);
  composer.addPass(new OutputPass());

  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.setFocalLength(FOCAL_MM);
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  // 右ページの重心を画面中央に保つ（向きと距離はそのまま平行移動）
  const centroid = new THREE.Vector3(), smoothed = new THREE.Vector3(0.6, 0.15, -0.15), target = new THREE.Vector3();
  const coverPos = coverR.geometry.attributes.position as THREE.BufferAttribute;

  const n = leaves.length;
  let raf = 0, disposed = false, lastState = '';
  const clock = new THREE.Clock();

  const frame = () => {
    if (disposed) return;
    raf = requestAnimationFrame(frame);
    if (document.hidden) return; // タブが見えていないときは描画しない
    const time = clock.getElapsedTime();
    const motion = !opts.reducedMotion;

    let flipping = 0, done = 0;
    leafGeos.forEach((geo, i) => {
      const p = motion ? leafProgress(i, time, n) : 0;
      if (p > 0.02 && p < 0.98) flipping++;
      if (p >= 0.98) done++;
      const o = leafOffsets(i, n);
      updateShape(geo, p, o.offRight, o.offLeft, o.air, motion ? 0.18 * Math.sin(time * 2.4 + i) : 0);
    });

    const local = time % cycleLength(n);
    const state: ShowcaseState['state'] = motion && local > forwardEnd(n) ? 'RIFFLE' : flipping ? 'TURNING' : 'HOLDING';
    const rightPageIndex = Math.min(done * 2, Math.max(0, opts.pages.length - 1));
    const summary = `${state}|${done}`;
    if (summary !== lastState) {
      lastState = summary;
      opts.onState?.({ state, page: Math.min(done + 1, Math.max(n, 1)), total: Math.max(n, 1), rightPageIndex });
    }

    if (motion) {
      magazine.position.y = Math.sin(time * 0.7) * 0.06;
      magazine.rotation.set(0.06, 0.3 + Math.sin(time * 0.25) * 0.06, -0.05 + Math.sin(time * 0.5) * 0.02);
      rings.children.forEach((l) => { l.rotation.y += (l.userData.speed as number) * 0.016; });
    } else {
      magazine.rotation.set(0.06, 0.3, -0.05);
    }
    ground.scale.setScalar(1 - magazine.position.y * 0.6);

    magazine.updateMatrixWorld();
    centroid.set(0, 0, 0);
    for (let k = 0; k < coverPos.count; k++) centroid.add(target.set(coverPos.getX(k), coverPos.getY(k), coverPos.getZ(k)));
    centroid.divideScalar(coverPos.count).applyMatrix4(magazine.matrixWorld);
    smoothed.lerp(centroid, motion ? 0.05 : 1);
    camera.position.copy(smoothed).add(VIEW_OFFSET);
    if (motion) { camera.position.x += Math.sin(time * 0.31) * 0.01; camera.position.y += Math.sin(time * 0.23) * 0.008; }
    camera.lookAt(smoothed);
    (bokeh.uniforms as Record<string, { value: number }>).focus!.value = camera.position.distanceTo(centroid);

    composer.render();
  };
  frame();

  return {
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        mesh.geometry?.dispose();
        const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
        mats.forEach((m) => { (m as THREE.MeshStandardMaterial).map?.dispose(); m.dispose(); });
      });
      composer.dispose();
      renderer.dispose();
    },
  };
}
