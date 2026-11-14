// 雑誌の 3D シーン（three.js）。トップとタグページ・作品詳細からだけ動的に読み込む。
// 「見せる」: 斜めの構図で自動でめくる。「読む」: カメラが紙面の正面へ回り込み、平らな紙に絵を本来の色で見せる。
// 紙の形・時間割・見開き・構図は three.js に依存しない関数（pageShape / schedule / spread / reading）を使う。
// 試作: docs/superpowers/specs/assets/2026-11-08-magazine-prototype.html
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { PAPER, leafOffsets, shapePage, vertexCount } from './pageShape';
import { cycleLength, forwardEnd, leafProgress } from './schedule';
import { buildLeaves, rightPageIndex as rightIndexOf } from './spread';
import type { MagazinePage } from './spread';
import { fitDistance, imageRect, nextPageIndex, type Insets, type Zoom } from './reading';

export type ShowcaseState = { state: 'TURNING' | 'HOLDING' | 'RIFFLE'; page: number; total: number; rightPageIndex: number };

/** ユーザーが決めた構図: 注視点から見たカメラの相対位置、焦点距離、ぼけ */
const VIEW_OFFSET = new THREE.Vector3(1.34, 2.89, 0.94);
const FOCAL_MM = 44;
const APERTURE = 0.006;
const MAX_BLUR = 0.006;

/** 「見せる」での雑誌の基本の向き */
const BASE_ROT = new THREE.Euler(0.06, 0.3, -0.05);
/** 読むモードへの（からの）カメラの移動、1 枚めくる時間（秒） */
const MOVE_SEC = 0.9;
const TURN_SEC = 0.7;
/** 読むモードで紙の周りに残す余白（紙の大きさに対する割合） */
const READ_MARGIN = 0.04;
/** 読むモードの紙の束の厚みは、この枚数分までに抑える */
const READ_STACK = 12;
/** 読むモードの紙のテクスチャの解像度（見せるモードに対する倍率） */
const READ_TEX_SCALE = 1.4;
/** 読むモードで、表示中のページから前後この枚数までの絵を読み込んでおく */
const READ_WINDOW = 2;

export type ShowcaseApi = {
  dispose(): void;
  /** 雑誌の中身を差し替え、カメラを正面へ移し、startIndex の絵を右ページに開く */
  read(opts: { pages: MagazinePage[]; startIndex: number; insets: Insets }): Promise<void>;
  /** 「見せる」モードに戻す */
  show(): void;
  /** 読むモードで 1 枚めくる */
  turn(delta: 1 | -1): void;
  /** 読むモードで、めくらずに index の絵を右ページに開く（準備中に送られたページに合わせる） */
  jumpTo(index: number): void;
  setZoom(z: Zoom): void;
  setInsets(i: Insets): void;
  /** めくり終わったとき（読むモード） */
  onPage?: (index: number) => void;
};

const smooth = (x: number) => x * x * (3 - 2 * x);

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

/** 紙の裏から透けて見える絵の濃さ */
const GHOST_ALPHA = 0.22;

/**
 * 生成りの紙に作品を余白付きで描いたテクスチャ（作品が無ければ無地の紙）。
 * ghost では、表の絵が紙の裏から透けて見えるように薄く描く（裏面に貼ると左右反転して見える）。
 */
function paperTexture(
  img: HTMLImageElement | null, ghost: boolean, colors: { sheet: string; ink: string; speck: string }, scale = 1,
): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = Math.round(900 * scale);
  c.height = Math.round(1200 * scale);
  const g = c.getContext('2d')!;
  g.fillStyle = colors.sheet;
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = colors.speck;
  const dot = 2 * scale;
  for (let i = 0; i < 2500; i++) g.fillRect(Math.random() * c.width, Math.random() * c.height, dot, dot);
  if (img) {
    // 余白の中に、本来の縦横比で収める
    const m = 70 * scale, box = { width: c.width - m * 2, height: c.height - m * 2 - 90 * scale };
    const r = imageRect({ width: img.naturalWidth, height: img.naturalHeight }, box);
    g.globalAlpha = ghost ? GHOST_ALPHA : 1;
    g.drawImage(img, m + r.x, m + r.y, r.width, r.height);
    g.globalAlpha = 1;
    if (!ghost) {
      g.fillStyle = colors.ink;
      g.font = `${Math.round(22 * scale)}px monospace`;
      g.fillText('JUNK JOURNAL JOURNEY', m, c.height - 70 * scale);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
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

function updateShape(
  geo: THREE.BufferGeometry, p: number, offRight: number, offLeft: number, air: number, flutter: number, flatten = 0,
  normals = true,
) {
  const attr = geo.attributes.position as THREE.BufferAttribute;
  shapePage(attr.array as Float32Array, p, offRight, offLeft, air, flutter, flatten);
  attr.needsUpdate = true;
  // 照明を受けない読むモードの紙では法線は使わない
  if (normals) geo.computeVertexNormals();
}

type Colors = Record<'paper' | 'sheet' | 'ink' | 'speck' | 'coverInner' | 'accent' | 'lineInk' | 'shadow' | 'shadowClear' | 'key' | 'rim' | 'sky' | 'ground', string>;

/** 読むモードの 1 枚の紙。絵は表示中のページの前後だけ読み込む */
type ReadLeaf = {
  geo: THREE.BufferGeometry;
  front: THREE.MeshBasicMaterial;
  back: THREE.MeshBasicMaterial;
  tex: 'none' | 'loading' | 'done';
  p: number;
  /** 前回の形（同じなら頂点を計算し直さない） */
  shaped: string;
};

type ReadBook = {
  group: THREE.Group;
  pages: MagazinePage[];
  leaves: ReadLeaf[];
  /** 右ページに開いている絵 */
  current: number;
  turning: { leaf: number; from: number; to: number; start: number; next: number } | null;
  disposed: boolean;
};

function disposeMaterial(m: THREE.Material, keep?: THREE.Texture) {
  const map = (m as THREE.MeshBasicMaterial).map;
  if (map && map !== keep) map.dispose();
  m.dispose();
}

export async function createShowcaseScene(
  canvas: HTMLCanvasElement,
  opts: { pages: MagazinePage[]; reducedMotion: boolean; onState?: (s: ShowcaseState) => void },
): Promise<ShowcaseApi> {
  const colors: Colors = {
    paper: cssVar('--paper'), sheet: cssVar('--sheet'), ink: cssVar('--sheet-ink'), speck: cssVar('--sheet-speck'),
    coverInner: cssVar('--cover-inner'), accent: cssVar('--accent'), lineInk: cssVar('--ink'),
    shadow: cssVar('--sheet-shadow'), shadowClear: cssVar('--sheet-shadow-clear'),
    key: cssVar('--light-key'), rim: cssVar('--light-rim'), sky: cssVar('--light-sky'), ground: cssVar('--light-ground'),
  };
  const motion = !opts.reducedMotion;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(colors.paper);
  const fog = new THREE.Fog(colors.paper, 7, 15);
  scene.fog = fog;

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

  // 「見せる」の中身（初めに渡された作品）
  const showGroup = new THREE.Group();
  magazine.add(showGroup);
  const leaves = buildLeaves(opts.pages);
  const images = await Promise.all(opts.pages.map((p) => loadImage(p.src)));
  const leafGeos = leaves.map((leaf, i) => {
    const geo = pageGeometry();
    const img = images[i] ?? null;
    // 表は絵、裏は同じ絵の透け（裏面に貼るので左右反転して見える）
    const front = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: paperTexture(img, false, colors), side: THREE.FrontSide, roughness: 0.92 }));
    const back = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: paperTexture(img, true, colors), side: THREE.BackSide, roughness: 0.92 }));
    showGroup.add(front, back);
    return geo;
  });

  // 表紙: 内側は紙の色、外側（下になる面）だけオレンジ。読むモードでは照明の影響を受けない材質に替える
  const coverInLit = new THREE.MeshStandardMaterial({ color: colors.coverInner, roughness: 0.85, side: THREE.DoubleSide });
  const coverOutLit = new THREE.MeshStandardMaterial({ color: colors.accent, roughness: 0.7, side: THREE.DoubleSide });
  const coverInFlat = new THREE.MeshBasicMaterial({ color: colors.coverInner, side: THREE.DoubleSide });
  const coverOutFlat = new THREE.MeshBasicMaterial({ color: colors.accent, side: THREE.DoubleSide });
  const coverMesh = (m: THREE.Material) => new THREE.Mesh<THREE.BufferGeometry, THREE.Material>(pageGeometry(), m);
  const coverR = coverMesh(coverInLit), coverL = coverMesh(coverInLit);
  const coverRo = coverMesh(coverOutLit), coverLo = coverMesh(coverOutLit);
  magazine.add(coverR, coverL, coverRo, coverLo);
  const g = PAPER.gap;
  let coverFlatten = -1;
  const shapeCovers = (flatten: number) => {
    if (flatten === coverFlatten) return;
    coverFlatten = flatten;
    updateShape(coverR.geometry, 0, g * 0.5, 0, 0, 0, flatten);
    updateShape(coverL.geometry, 1, 0, g * 0.5, 0, 0, flatten);
    updateShape(coverRo.geometry, 0, -g * 0.6, 0, 0, 0, flatten);
    updateShape(coverLo.geometry, 1, 0, -g * 0.6, 0, 0, flatten);
  };
  shapeCovers(0);

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
  const bokehUniforms = bokeh.uniforms as Record<string, { value: number }>;

  let viewW = 1, viewH = 1;
  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w === 0 || h === 0) return;
    viewW = w;
    viewH = h;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.setFocalLength(FOCAL_MM);
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  // ---- 読むモード ----
  const blankRead = paperTexture(null, false, colors);
  let book: ReadBook | null = null;
  /** 0 = 見せる、1 = 読む（カメラの移動の進み） */
  let blend = 0;
  let mode: 'show' | 'read' = 'show';
  let insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
  let zoom: Zoom = { scale: 1, x: 0, y: 0 };
  let api: ShowcaseApi;
  /** read・show のたびに増やす。読み込み待ちの間に閉じた・切り替えた read の続きを捨てる */
  let readToken = 0;

  const disposeBook = (b: ReadBook) => {
    b.disposed = true;
    magazine.remove(b.group);
    for (const l of b.leaves) {
      l.geo.dispose();
      disposeMaterial(l.front, blankRead);
      disposeMaterial(l.back, blankRead);
    }
  };

  /** 表示中のページの前後の絵を読み込み、遠いページの絵は手放す */
  const loadAround = (b: ReadBook) => {
    b.leaves.forEach((l, i) => {
      const dist = Math.abs(i - b.current);
      if (dist <= READ_WINDOW && l.tex === 'none') {
        l.tex = 'loading';
        void loadImage(b.pages[i]!.src).then((img) => {
          if (b.disposed || l.tex !== 'loading') return;
          l.front.map = paperTexture(img, false, colors, READ_TEX_SCALE);
          l.back.map = paperTexture(img, true, colors);
          l.front.needsUpdate = l.back.needsUpdate = true;
          l.tex = 'done';
        });
      } else if (dist > READ_WINDOW * 2 && l.tex !== 'none') {
        if (l.front.map !== blankRead) l.front.map?.dispose();
        if (l.back.map !== blankRead) l.back.map?.dispose();
        l.front.map = l.back.map = blankRead;
        l.front.needsUpdate = l.back.needsUpdate = true;
        l.tex = 'none';
      }
    });
  };

  const finishTurn = (b: ReadBook) => {
    const t = b.turning;
    if (!t) return;
    b.leaves[t.leaf]!.p = t.to;
    b.turning = null;
    api.onPage?.(b.current);
  };

  // 右ページの重心を画面中央に保つ（向きと距離はそのまま平行移動）
  const centroid = new THREE.Vector3(), smoothed = new THREE.Vector3(0.6, 0.15, -0.15), tmp = new THREE.Vector3();
  const coverPos = coverR.geometry.attributes.position as THREE.BufferAttribute;
  const showPos = new THREE.Vector3(), readPos = new THREE.Vector3(), readTarget = new THREE.Vector3();
  const lookTarget = new THREE.Vector3(), readUp = new THREE.Vector3(), readRight = new THREE.Vector3(), readNormal = new THREE.Vector3();
  const WORLD_UP = new THREE.Vector3(0, 1, 0);

  const n = leaves.length;
  let raf = 0, disposed = false, lastState = '';
  const clock = new THREE.Clock();
  let prevTime = 0;

  const frame = () => {
    if (disposed) return;
    raf = requestAnimationFrame(frame);
    if (document.hidden) return; // タブが見えていないときは描画しない
    const time = clock.getElapsedTime();
    const dt = Math.min(0.1, time - prevTime);
    prevTime = time;

    // 見せる ⇄ 読む の進み
    const goal = mode === 'read' ? 1 : 0;
    blend = motion ? (goal > blend ? Math.min(goal, blend + dt / MOVE_SEC) : Math.max(goal, blend - dt / MOVE_SEC)) : goal;
    const e = smooth(blend);
    if (blend === 0 && book && mode === 'show') {
      disposeBook(book);
      book = null;
      lastState = '';
    }
    const reading = !!book;
    showGroup.visible = !reading;
    const flatMats = reading;
    if ((coverR.material === coverInFlat) !== flatMats) {
      coverR.material = coverL.material = flatMats ? coverInFlat : coverInLit;
      coverRo.material = coverLo.material = flatMats ? coverOutFlat : coverOutLit;
    }
    shapeCovers(e);
    const drift = motion ? 1 - e : 0;

    if (!book) {
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
      const rightPageIndex = rightIndexOf(done, opts.pages.length);
      const summary = `${state}|${done}`;
      if (summary !== lastState) {
        lastState = summary;
        opts.onState?.({ state, page: rightPageIndex + 1, total: Math.max(opts.pages.length, 1), rightPageIndex });
      }
    } else {
      const b = book;
      if (b.turning) {
        const u = motion ? Math.min(1, (time - b.turning.start) / TURN_SEC) : 1;
        b.leaves[b.turning.leaf]!.p = b.turning.from + (b.turning.to - b.turning.from) * smooth(u);
        if (u >= 1) finishTurn(b);
      }
      const count = b.leaves.length, k = Math.min(1, READ_STACK / Math.max(count, 1));
      b.leaves.forEach((l, i) => {
        const turningThis = b.turning?.leaf === i;
        const flutter = turningThis && motion ? 0.15 : 0;
        const key = `${l.p}|${e}|${flutter}`;
        if (key === l.shaped) return;
        l.shaped = key;
        const o = leafOffsets(i, count);
        updateShape(l.geo, l.p, o.offRight * k, o.offLeft * k, o.air * k, flutter, e, false);
      });
    }

    // 雑誌の漂い（読むモードでは止める）
    magazine.position.y = Math.sin(time * 0.7) * 0.06 * drift;
    magazine.rotation.set(
      BASE_ROT.x,
      BASE_ROT.y + Math.sin(time * 0.25) * 0.06 * drift,
      BASE_ROT.z + Math.sin(time * 0.5) * 0.02 * drift,
    );
    if (drift > 0) rings.children.forEach((l) => { l.rotation.y += (l.userData.speed as number) * 0.016 * drift; });
    ground.scale.setScalar(1 - magazine.position.y * 0.6);
    magazine.updateMatrixWorld();

    // 見せる構図
    centroid.set(0, 0, 0);
    for (let k = 0; k < coverPos.count; k++) centroid.add(tmp.set(coverPos.getX(k), coverPos.getY(k), coverPos.getZ(k)));
    centroid.divideScalar(coverPos.count).applyMatrix4(magazine.matrixWorld);
    smoothed.lerp(centroid, motion ? 0.05 : 1);
    showPos.copy(smoothed).add(VIEW_OFFSET);
    if (motion) { showPos.x += Math.sin(time * 0.31) * 0.01 * drift; showPos.y += Math.sin(time * 0.23) * 0.008 * drift; }

    if (book && e > 0) {
      // 読む構図: 右ページの真上（紙面の法線方向）から、パネルを除いた領域に収まる距離で見る
      const count = book.leaves.length, k = Math.min(1, READ_STACK / Math.max(count, 1));
      const top = book.current < count ? leafOffsets(book.current, count).offRight * k : g * 0.5;
      const q = magazine.quaternion;
      readNormal.set(0, 1, 0).applyQuaternion(q);
      readUp.set(0, 0, -1).applyQuaternion(q); // 紙の上端（テクスチャの上）が画面の上
      readRight.set(1, 0, 0).applyQuaternion(q);
      const fovV = THREE.MathUtils.degToRad(camera.fov);
      const fit = fitDistance({
        pageW: PAPER.width, pageH: PAPER.height, fovV, aspect: camera.aspect, viewW, viewH, insets, margin: READ_MARGIN,
      });
      const dist = fit / zoom.scale;
      // ズームの移動量（画面の px）を、紙面上の距離に直す。絵が右へ動く＝カメラは左へ
      const perPx = (2 * Math.tan(fovV / 2) * dist) / viewH;
      readTarget.set(PAPER.width / 2, top, 0).applyMatrix4(magazine.matrixWorld)
        .addScaledVector(readRight, -zoom.x * perPx)
        .addScaledVector(readUp, zoom.y * perPx);
      readPos.copy(readTarget).addScaledVector(readNormal, dist);

      camera.position.lerpVectors(showPos, readPos, e);
      lookTarget.lerpVectors(smoothed, readTarget, e);
      camera.up.lerpVectors(WORLD_UP, readUp, e).normalize();
      // 投影の中心を、パネルを除いた領域の中央へずらす
      const dx = (insets.left - insets.right) / 2, dy = (insets.top - insets.bottom) / 2;
      camera.setViewOffset(viewW, viewH, -dx * e, -dy * e, viewW, viewH);
    } else {
      camera.position.copy(showPos);
      lookTarget.copy(smoothed);
      camera.up.copy(WORLD_UP);
      camera.clearViewOffset();
    }
    camera.lookAt(lookTarget);
    camera.updateProjectionMatrix();

    // 読むモードでは、ぼけと霧を掛けない（本来の色と形）
    bokeh.enabled = e < 1;
    bokehUniforms.aperture!.value = APERTURE * (1 - e);
    bokehUniforms.maxblur!.value = MAX_BLUR * (1 - e);
    bokehUniforms.focus!.value = camera.position.distanceTo(book ? readTarget : centroid);
    fog.near = 7 + e * 100;
    fog.far = 15 + e * 100;

    composer.render();
  };

  api = {
    async read({ pages, startIndex, insets: i }) {
      if (pages.length === 0) return;
      insets = i;
      zoom = { scale: 1, x: 0, y: 0 };
      const start = Math.max(0, Math.min(startIndex, pages.length - 1));
      const token = ++readToken;
      // 最初に見せる絵を読み込んでから差し替える（白い紙が一瞬見えないように）
      await loadImage(pages[start]!.src);
      if (disposed || token !== readToken) return;
      if (book) disposeBook(book);
      const group = new THREE.Group();
      const b: ReadBook = { group, pages, leaves: [], current: start, turning: null, disposed: false };
      b.leaves = pages.map((_, idx) => {
        const geo = pageGeometry();
        const front = new THREE.MeshBasicMaterial({ map: blankRead, side: THREE.FrontSide });
        const back = new THREE.MeshBasicMaterial({ map: blankRead, side: THREE.BackSide });
        group.add(new THREE.Mesh(geo, front), new THREE.Mesh(geo, back));
        return { geo, front, back, tex: 'none' as const, p: idx < start ? 1 : 0, shaped: '' };
      });
      magazine.add(group);
      book = b;
      mode = 'read';
      loadAround(b);
    },
    show() {
      readToken++;
      mode = 'show';
      zoom = { scale: 1, x: 0, y: 0 };
    },
    jumpTo(index) {
      const b = book;
      if (!b || mode !== 'read') return;
      const next = Math.max(0, Math.min(index, b.leaves.length - 1));
      b.turning = null;
      b.current = next;
      b.leaves.forEach((l, i) => { l.p = i < next ? 1 : 0; });
      loadAround(b);
    },
    turn(delta) {
      const b = book;
      if (!b || mode !== 'read') return;
      finishTurn(b);
      const next = nextPageIndex(b.current, delta, b.leaves.length);
      if (next === b.current) return;
      const leaf = delta === 1 ? b.current : next;
      const from = delta === 1 ? 0 : 1;
      b.current = next;
      zoom = { scale: 1, x: 0, y: 0 };
      b.turning = { leaf, from, to: 1 - from, start: clock.getElapsedTime(), next };
      loadAround(b);
      if (!motion) finishTurn(b);
    },
    setZoom(z) {
      zoom = z;
    },
    setInsets(i) {
      insets = i;
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      if (book) disposeBook(book);
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        mesh.geometry?.dispose();
        const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
        mats.forEach((m) => disposeMaterial(m));
      });
      [coverInLit, coverOutLit, coverInFlat, coverOutFlat].forEach((m) => m.dispose());
      blankRead.dispose();
      composer.dispose();
      renderer.dispose();
    },
  };
  frame();
  return api;
}
