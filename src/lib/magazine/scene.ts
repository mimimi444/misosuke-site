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
import { cycleLength, forwardEnd, leafProgress, manualTurn } from './schedule';
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
/** 見せるモードから読むモードへ移るとき、見えていたページをめくる時間（カメラの移動と同じ） */
const PASS_SEC = MOVE_SEC;
/** 手でめくる 1 枚の時間と、めくった後に自動めくりを止めておく時間（秒） */
const MANUAL_TURN_SEC = 0.6;
const MANUAL_HOLD_SEC = 4;
/** 読むモードで紙の周りに残す余白（紙の大きさに対する割合） */
const READ_MARGIN = 0.04;
/** 読むモードの紙の束の厚みは、この枚数分までに抑える */
const READ_STACK = 12;
/** 読むモードの紙のテクスチャの解像度（見せるモードに対する倍率） */
const READ_TEX_SCALE = 1.4;
/** 読むモードで、表示中のページから前後この枚数までの絵を読み込んでおく */
const READ_WINDOW = 2;

/** 読むモードのページ。幅・高さが分かれば、絵の読み込み前から本来の縦横比で並べる */
export type ReadPage = MagazinePage & { width?: number | null; height?: number | null };

export type ShowcaseApi = {
  dispose(): void;
  /** 雑誌の中身を差し替え、カメラを正面へ移し、startIndex の絵を右ページに開く */
  read(opts: { pages: ReadPage[]; startIndex: number; insets: Insets }): Promise<void>;
  /** 「見せる」モードに戻す */
  show(): void;
  /** 見せるモードで手で 1 枚めくる（スワイプ）。1 = 次、-1 = 前 */
  flip(delta: 1 | -1): void;
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
  pages: ReadPage[];
  leaves: ReadLeaf[];
  /** 右ページに開いている絵 */
  current: number;
  turning: { leaf: number; from: number; to: number; start: number; next: number } | null;
  disposed: boolean;
  /** アルバム（2 ページ以上）の絵の列。1 枚ものは null */
  gallery: Gallery | null;
};

/**
 * アルバムの絵の列。どのページも本来の縦横比の絵そのもので、紙面の絵の枠に収まる大きさで横一列に並ぶ。
 * 中央（右ページの絵の枠）にあるのが表示中のページで、ほかは白く薄く覆う。
 * 開いて少ししてから、ほかのページが表示中の絵の下から横へ滑り出す。ページを送ると列ごと横へずれる。
 */
type GalleryItem = {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  veil: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  w: number;
  /** 列の中での中心の位置 */
  c: number;
  src: string;
  tex: 'none' | 'loading' | 'done';
};
type Gallery = {
  group: THREE.Group;
  items: GalleryItem[];
  /** 滑り出しを始める時刻と、そのとき表示していたページ */
  introStart: number;
  introIndex: number;
  /** 列の位置の動き（c の値）。ページを送るとき from から to へ */
  from: number;
  to: number;
  moveStart: number;
};

/** 開いてから滑り出すまで（秒）、滑り出しの長さ、1 枚ずつずらす間隔、ページを送るときの長さ */
const GALLERY_DELAY = 0.3;
const GALLERY_INTRO_SEC = 1.1 / 1.5;
const GALLERY_STAGGER = 0.08;
const GALLERY_SLIDE_SEC = 0.55;
/** 絵と絵の隙間、表示中以外を覆う白の濃さ */
const GALLERY_GAP = 0.12;
const GALLERY_VEIL = 0.5;
/** 表示中のページから前後この枚数の絵を読み込み、離れたら手放す */
const GALLERY_WINDOW = 3;
const GALLERY_TEX_PX = 1600;
/** 紙面の絵の枠（paperTexture の余白と同じ割合） */
const IMAGE_BOX_W = (900 - 70 * 2) / 900;
const IMAGE_BOX_H = (1200 - 70 * 2 - 90) / 1200;
const IMAGE_BOX_CENTER = (70 + (1200 - 70 * 2 - 90) / 2) / 1200 - 0.5;

const easeOut = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

/** 絵のテクスチャ（長辺を抑える） */
function imageTexture(img: HTMLImageElement): THREE.CanvasTexture {
  const k = Math.min(1, GALLERY_TEX_PX / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.naturalWidth * k));
  c.height = Math.max(1, Math.round(img.naturalHeight * k));
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

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
  /** 見せる紙の表と裏のテクスチャ（読むモードへ移るとき、見えていたページをめくる紙に使う） */
  const showMaps: { front: THREE.Texture; back: THREE.Texture }[] = [];
  const leafGeos = leaves.map((leaf, i) => {
    const geo = pageGeometry();
    const img = images[i] ?? null;
    // 表は絵、裏は同じ絵の透け（裏面に貼るので左右反転して見える）
    const front = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: paperTexture(img, false, colors), side: THREE.FrontSide, roughness: 0.92 }));
    const back = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: paperTexture(img, true, colors), side: THREE.BackSide, roughness: 0.92 }));
    showGroup.add(front, back);
    showMaps.push({ front: front.material.map!, back: back.material.map! });
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

  const disposeGallery = (g: Gallery) => {
    g.items.forEach((it) => {
      it.mesh.material.map?.dispose();
      it.mesh.geometry.dispose();
      it.mesh.material.dispose();
      it.veil.geometry.dispose();
      it.veil.material.dispose();
    });
  };

  /** アルバムの絵の列を作る。絵の大きさは紙面の絵の枠に収まる大きさ（縦横比はデータの幅・高さから） */
  const buildGallery = (pages: ReadPage[], start: number, time: number): Gallery => {
    const boxW = PAPER.width * IMAGE_BOX_W, boxH = PAPER.height * IMAGE_BOX_H;
    const group = new THREE.Group();
    group.position.z = PAPER.height * IMAGE_BOX_CENTER;
    const items: GalleryItem[] = [];
    let c = 0;
    pages.forEach((p, i) => {
      const aspect = p.width && p.height ? p.width / p.height : 3 / 4;
      const scale = Math.min(boxW / aspect, boxH);
      const w = scale * aspect, h = scale;
      if (i > 0) c += items[i - 1]!.w / 2 + GALLERY_GAP + w / 2;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: colors.sheet, transparent: true, opacity: 0 }));
      const veil = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: colors.sheet, transparent: true, opacity: 0, depthWrite: false }));
      mesh.rotation.x = veil.rotation.x = -Math.PI / 2; // 紙と同じく上を向けて寝かせる
      group.add(mesh, veil);
      items.push({ mesh, veil, w, c, src: p.src, tex: 'none' });
    });
    const at = items[start]!.c;
    return { group, items, introStart: time + GALLERY_DELAY, introIndex: start, from: at, to: at, moveStart: time };
  };

  /** 表示中のページの前後の絵を読み込み、遠い絵は手放す */
  const loadGalleryAround = (b: ReadBook, g: Gallery) => {
    g.items.forEach((it, i) => {
      const dist = Math.abs(i - b.current);
      if (dist <= GALLERY_WINDOW && it.tex === 'none') {
        it.tex = 'loading';
        void loadImage(it.src).then((img) => {
          if (b.disposed || it.tex !== 'loading') return;
          if (!img) { it.tex = 'none'; return; }
          it.mesh.material.map = imageTexture(img);
          it.mesh.material.color.set(0xffffff);
          it.mesh.material.needsUpdate = true;
          it.tex = 'done';
        });
      } else if (dist > GALLERY_WINDOW * 2 && it.tex === 'done') {
        it.mesh.material.map?.dispose();
        it.mesh.material.map = null;
        it.mesh.material.color.set(colors.sheet);
        it.mesh.material.needsUpdate = true;
        it.tex = 'none';
      }
    });
  };

  /** 列の位置・重なり・白い覆い。e は読むモードへの進み、top は紙の上面の高さ */
  const updateGallery = (b: ReadBook, g: Gallery, time: number, e: number, top: number) => {
    const centerX = PAPER.width / 2;
    const u = motion ? (time - g.moveStart) / GALLERY_SLIDE_SEC : 1;
    const pos = g.from + (g.to - g.from) * easeOut(u);
    const zoomed = zoom.scale > 1.001;
    g.items.forEach((it, i) => {
      const target = centerX + (it.c - pos);
      // 滑り出し: 開いたときに表示していた絵の下から、近い順に少しずつずらして横へ
      const k = Math.abs(i - g.introIndex);
      const p = !motion || k === 0 ? 1 : easeOut((time - g.introStart - (k - 1) * GALLERY_STAGGER) / GALLERY_INTRO_SEC);
      const x = centerX + (target - centerX) * p;
      const slot = it.w + GALLERY_GAP;
      const d = Math.abs(x - centerX) / slot;
      // 中央に近いほど上に重ねる（下から滑り出して見えるように）。同じ位置なら開いたときの絵に近い順
      const y = top + 0.004 + 0.004 / (1 + d) - 0.0003 * k;
      it.mesh.position.set(x, y, 0);
      it.veil.position.set(x, y + 0.0001, 0);
      const opacity = zoomed && i !== b.current ? 0 : e;
      it.mesh.material.opacity = opacity;
      it.mesh.visible = opacity > 0.001;
      it.veil.material.opacity = opacity * GALLERY_VEIL * Math.min(1, d * 2);
      it.veil.visible = it.veil.material.opacity > 0.001;
    });
  };

  const disposeBook = (b: ReadBook) => {
    b.disposed = true;
    endPassing();
    if (b.gallery) disposeGallery(b.gallery);
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
  /** 見せるモードの時間割の時刻（手でめくると実際の時刻からずれる） */
  let showT = 0;
  let manual: { target: number; rate: number } | null = null;
  let holdUntil = 0;
  /** 見せるモードで右ページに見えている紙（leafGeos の番号。全部めくれていれば leafGeos.length） */
  let showRightLeaf = 0;
  /** 読むモードへ移るとき、見えていたページをめくる紙 */
  let passing: { geo: THREE.BufferGeometry; group: THREE.Group; front: THREE.MeshBasicMaterial; back: THREE.MeshBasicMaterial; start: number } | null = null;
  const endPassing = () => {
    if (!passing) return;
    passing.group.parent?.remove(passing.group);
    passing.geo.dispose();
    // テクスチャは見せる紙と共有しているので、材質だけ捨てる
    passing.front.dispose();
    passing.back.dispose();
    passing = null;
  };
  /** 読む構図のカメラの距離と投影の中心のずれ（イーズアウトで追いかける） */
  let fitSmooth: number | null = null;
  const offsetSmooth = { x: 0, y: 0 };

  const frame = () => {
    if (disposed) return;
    raf = requestAnimationFrame(frame);
    if (document.hidden) return; // タブが見えていないときは描画しない
    const time = clock.getElapsedTime();
    const dt = Math.min(0.1, time - prevTime);
    prevTime = time;

    // 見せるモードの時間割の時刻。手でめくったときは目標の時刻へ素早く進め（戻し）、その後しばらく自動で進めない
    if (manual) {
      const step = manual.rate * dt;
      if (Math.abs(manual.target - showT) <= step) {
        showT = manual.target;
        manual = null;
        holdUntil = time + MANUAL_HOLD_SEC;
      } else showT += Math.sign(manual.target - showT) * step;
    } else if (motion && time >= holdUntil && !book) showT += dt;

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
        const p = leafProgress(i, showT, n);
        if (p > 0.02 && p < 0.98) flipping++;
        if (p >= 0.98) done++;
        const o = leafOffsets(i, n);
        updateShape(geo, p, o.offRight, o.offLeft, o.air, motion ? 0.18 * Math.sin(time * 2.4 + i) : 0);
      });

      const local = showT % cycleLength(n);
      const state: ShowcaseState['state'] = motion && local > forwardEnd(n) ? 'RIFFLE' : flipping ? 'TURNING' : 'HOLDING';
      const rightPageIndex = rightIndexOf(done, opts.pages.length);
      showRightLeaf = done;
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

    if (book?.gallery) {
      const k = Math.min(1, READ_STACK / Math.max(book.leaves.length, 1));
      updateGallery(book, book.gallery, time, e, leafOffsets(0, book.leaves.length).offRight * k);
    }
    if (book && passing) {
      // 見えていたページが左へめくれ、その下から選んだ作品が現れる（カメラの移動と同時に）
      const u = Math.min(1, (time - passing.start) / PASS_SEC);
      const count = book.leaves.length, k = Math.min(1, READ_STACK / Math.max(count, 1));
      const o = leafOffsets(0, count).offRight * k + 0.02;
      updateShape(passing.geo, smooth(u), o, o, g * 4, 0.18 * Math.sin(Math.PI * u), e, false);
      if (u >= 1) endPassing();
    }

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
      const topIndex = book.gallery ? 0 : book.current;
      const top = topIndex < count ? leafOffsets(topIndex, count).offRight * k : g * 0.5;
      const q = magazine.quaternion;
      readNormal.set(0, 1, 0).applyQuaternion(q);
      readUp.set(0, 0, -1).applyQuaternion(q); // 紙の上端（テクスチャの上）が画面の上
      readRight.set(1, 0, 0).applyQuaternion(q);
      const fovV = THREE.MathUtils.degToRad(camera.fov);
      const fit = fitDistance({
        pageW: PAPER.width, pageH: PAPER.height, fovV, aspect: camera.aspect, viewW, viewH, insets, margin: READ_MARGIN,
      });
      // パネルの大きさが変わったときなどの距離・中心のずれの変化は、急に跳ばずにイーズアウトで移る
      const follow = motion && fitSmooth !== null ? 1 - Math.exp(-dt * 7) : 1;
      fitSmooth = fitSmooth === null ? fit : fitSmooth + (fit - fitSmooth) * follow;
      const dist = fitSmooth / zoom.scale;
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
      offsetSmooth.x += (dx - offsetSmooth.x) * follow;
      offsetSmooth.y += (dy - offsetSmooth.y) * follow;
      camera.setViewOffset(viewW, viewH, -offsetSmooth.x * e, -offsetSmooth.y * e, viewW, viewH);
    } else {
      fitSmooth = null;
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
      // 見せるモードから移るときは、見えていたページを 1 枚のせて、めくって見せる
      const fromShow = !book && motion && blend < 0.5;
      endPassing();
      if (book) disposeBook(book);
      const group = new THREE.Group();
      const b: ReadBook = { group, pages, leaves: [], current: start, turning: null, disposed: false, gallery: null };
      // アルバムは無地の紙 1 枚の上に絵の列を置く（ページは紙をめくらず、列を横へずらして送る）。1 枚ものは紙に絵を描く
      const isAlbum = pages.length >= 2;
      const leafPages = isAlbum ? pages.slice(0, 1) : pages;
      b.leaves = leafPages.map((_, idx) => {
        const geo = pageGeometry();
        const front = new THREE.MeshBasicMaterial({ map: blankRead, side: THREE.FrontSide });
        const back = new THREE.MeshBasicMaterial({ map: blankRead, side: THREE.BackSide });
        group.add(new THREE.Mesh(geo, front), new THREE.Mesh(geo, back));
        return { geo, front, back, tex: isAlbum ? ('done' as const) : ('none' as const), p: !isAlbum && idx < start ? 1 : 0, shaped: '' };
      });
      if (isAlbum) {
        b.gallery = buildGallery(pages, start, clock.getElapsedTime());
        group.add(b.gallery.group);
      }
      magazine.add(group);
      if (fromShow) {
        const maps = showMaps[showRightLeaf];
        const geo = pageGeometry();
        const front = new THREE.MeshBasicMaterial({ map: maps?.front ?? blankRead, side: THREE.FrontSide });
        const back = new THREE.MeshBasicMaterial({ map: maps?.back ?? blankRead, side: THREE.BackSide });
        const pg = new THREE.Group();
        pg.add(new THREE.Mesh(geo, front), new THREE.Mesh(geo, back));
        group.add(pg);
        passing = { geo, group: pg, front, back, start: clock.getElapsedTime() };
      }
      book = b;
      mode = 'read';
      if (b.gallery) loadGalleryAround(b, b.gallery);
      else loadAround(b);
    },
    show() {
      readToken++;
      endPassing();
      mode = 'show';
      zoom = { scale: 1, x: 0, y: 0 };
    },
    flip(delta) {
      if (book || leafGeos.length === 0) return;
      const m = manualTurn(manual ? manual.target : showT, leafGeos.length, delta);
      if (!m) return;
      showT = m.jump;
      if (!motion) { showT = m.target; manual = null; return; }
      manual = { target: m.target, rate: Math.max(0.01, Math.abs(m.target - m.jump)) / MANUAL_TURN_SEC };
    },
    jumpTo(index) {
      const b = book;
      if (!b || mode !== 'read') return;
      if (b.gallery) {
        const g = b.gallery;
        b.current = Math.max(0, Math.min(index, g.items.length - 1));
        g.from = g.to = g.items[b.current]!.c;
        loadGalleryAround(b, g);
        return;
      }
      const next = Math.max(0, Math.min(index, b.leaves.length - 1));
      b.turning = null;
      b.current = next;
      b.leaves.forEach((l, i) => { l.p = i < next ? 1 : 0; });
      loadAround(b);
    },
    turn(delta) {
      const b = book;
      if (!b || mode !== 'read') return;
      if (b.gallery) {
        // アルバム: 列を横へずらし、次（前）の絵を表示中の位置へ滑り込ませる
        const g = b.gallery;
        const next = nextPageIndex(b.current, delta, g.items.length);
        if (next === b.current) return;
        const now = clock.getElapsedTime();
        const u = motion ? (now - g.moveStart) / GALLERY_SLIDE_SEC : 1;
        g.from = g.from + (g.to - g.from) * easeOut(u); // 動いている途中からでも滑らかに続ける
        g.to = g.items[next]!.c;
        g.moveStart = now;
        b.current = next;
        zoom = { scale: 1, x: 0, y: 0 };
        loadGalleryAround(b, g);
        return;
      }
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
