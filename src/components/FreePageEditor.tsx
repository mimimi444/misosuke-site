// 管理画面: トップの雑誌の最後のページ（フリーページ）の編集。
// 左の部品をドラッグ（またはクリック）でページに置き、ページの中もドラッグで並べ替える。キーボードでは ↑↓ ボタンで動かす。
// 右のプレビューは、トップの雑誌の紙と同じ描き方（drawFreePage）で描く。
import { useEffect, useMemo, useRef, useState } from 'react';
import { actions } from 'astro:actions';
import {
  countChars, MAX_UNITS, MAX_WIDGETS, pageProblems, unitsOf, widgetProblem, WIDGETS,
  type FreePage, type Widget, type WidgetType,
} from '../lib/freePage/model';
import { drawFreePage, RENDER_H, RENDER_W } from '../lib/freePage/render';

export type PickableImage = { id: string; thumb: string; src: string; title: string };

type Props = { initial: FreePage; images: PickableImage[] };

const TYPES: WidgetType[] = ['heading', 'text', 'note', 'image', 'link', 'divider'];
const DRAG_NEW = 'application/x-free-widget-type';
const DRAG_MOVE = 'application/x-free-widget-index';

function newWidget(type: WidgetType): Widget {
  const id = Math.random().toString(36).slice(2, 10);
  switch (type) {
    case 'heading': return { id, type, text: '見出し' };
    case 'text': return { id, type, text: '本文' };
    case 'note': return { id, type, text: 'NOTE' };
    case 'image': return { id, type, imageId: '' };
    case 'link': return { id, type, label: 'リンク', url: 'https://' };
    case 'divider': return { id, type };
  }
}

function summary(w: Widget, images: PickableImage[]): string {
  switch (w.type) {
    case 'heading': case 'text': case 'note': return w.text.replace(/\n/g, ' ') || '（空）';
    case 'link': return `${w.label} → ${w.url}`;
    case 'image': return images.find((i) => i.id === w.imageId)?.title ?? '（画像を選んでください）';
    case 'divider': return '―――';
  }
}

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export default function FreePageEditor({ initial, images }: Props) {
  const [widgets, setWidgets] = useState<Widget[]>(initial.widgets);
  const [selected, setSelected] = useState<string | null>(initial.widgets[0]?.id ?? null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const loaded = useRef(new Map<string, HTMLImageElement>());
  const [imgTick, setImgTick] = useState(0);

  const page: FreePage = { widgets };
  const problems = pageProblems(page);
  const used = unitsOf(widgets);
  const current = widgets.find((w) => w.id === selected) ?? null;

  // プレビュー: 画像と文字を読み込んでから描く
  useEffect(() => {
    let cancelled = false;
    const need = widgets.flatMap((w) => (w.type === 'image' && w.imageId && !loaded.current.has(w.imageId) ? [w.imageId] : []));
    need.forEach((id) => {
      const src = images.find((i) => i.id === id)?.src;
      if (!src) return;
      const img = new Image();
      img.onload = () => { loaded.current.set(id, img); if (!cancelled) setImgTick((t) => t + 1); };
      img.src = src;
    });
    void Promise.all([
      document.fonts?.load('700 48px "Noto Sans JP"').catch(() => undefined),
      document.fonts?.load('400 48px "Noto Sans JP"').catch(() => undefined),
    ]).then(() => {
      const c = canvasRef.current;
      if (cancelled || !c) return;
      const ctx = c.getContext('2d')!;
      ctx.clearRect(0, 0, c.width, c.height);
      drawFreePage(ctx, widgets.filter((w) => !widgetProblem(w) || w.type === 'image'), loaded.current, {
        ink: cssVar('--ink'), muted: cssVar('--ink-muted'), accent: cssVar('--accent'), line: cssVar('--line-strong'),
      });
    });
    return () => { cancelled = true; };
  }, [widgets, imgTick, images]);

  const update = (id: string, patch: Partial<Widget>) =>
    setWidgets((ws) => ws.map((w) => (w.id === id ? ({ ...w, ...patch } as Widget) : w)));

  const insert = (type: WidgetType, at: number) => {
    if (widgets.length >= MAX_WIDGETS) return;
    const w = newWidget(type);
    setWidgets((ws) => [...ws.slice(0, at), w, ...ws.slice(at)]);
    setSelected(w.id);
    setStatus(null);
  };

  const move = (from: number, to: number) => {
    setWidgets((ws) => {
      if (from === to || from + 1 === to) return ws;
      const next = [...ws];
      const [w] = next.splice(from, 1);
      next.splice(from < to ? to - 1 : to, 0, w!);
      return next;
    });
  };

  const remove = (id: string) => {
    setWidgets((ws) => ws.filter((w) => w.id !== id));
    if (selected === id) setSelected(null);
  };

  const onDrop = (e: React.DragEvent, at: number) => {
    e.preventDefault();
    setDropAt(null);
    const type = e.dataTransfer.getData(DRAG_NEW) as WidgetType;
    if (type && TYPES.includes(type)) return insert(type, at);
    const from = e.dataTransfer.getData(DRAG_MOVE);
    if (from !== '') move(Number(from), at);
  };

  const dropZone = (at: number) => (
    <li
      key={`drop-${at}`}
      className={`free-drop${dropAt === at ? ' is-over' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDropAt(at); }}
      onDragLeave={() => setDropAt((d) => (d === at ? null : d))}
      onDrop={(e) => onDrop(e, at)}
      aria-hidden="true"
    />
  );

  const save = async () => {
    setSaving(true);
    setStatus(null);
    const { error } = await actions.saveFreePage({ data: JSON.stringify(page) });
    setSaving(false);
    setStatus(error ? { kind: 'error', text: error.message } : { kind: 'ok', text: '保存しました。トップの雑誌の最後のページに表示されます。' });
  };

  const meter = useMemo(() => Math.min(100, (used / MAX_UNITS) * 100), [used]);

  return (
    <div className="free-editor">
      <section className="panel free-palette" aria-label="部品">
        <p className="hud-label">WIDGETS</p>
        <p className="free-hint">ページへドラッグするか、押して末尾に追加</p>
        <ul className="stack">
          {TYPES.map((type) => (
            <li key={type}>
              <button
                type="button"
                className="btn btn-ghost btn-sm free-palette-item"
                draggable
                onDragStart={(e) => { e.dataTransfer.setData(DRAG_NEW, type); e.dataTransfer.effectAllowed = 'copy'; }}
                onClick={() => insert(type, widgets.length)}
                disabled={widgets.length >= MAX_WIDGETS}
              >
                ＋ {WIDGETS[type].label}
                <span className="hud-label">{WIDGETS[type].units}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel free-stack" aria-label="ページの並び">
        <div className="row free-stack-head">
          <p className="hud-label">PAGE</p>
          <p className="mono-number free-meter-label">{used} / {MAX_UNITS}</p>
        </div>
        <div className={`free-meter${used > MAX_UNITS ? ' is-over' : ''}`} aria-hidden="true">
          <span style={{ width: `${meter}%` }} />
        </div>
        <ol className="free-list">
          {dropZone(0)}
          {widgets.map((w, i) => {
            const problem = widgetProblem(w);
            return [
              <li
                key={w.id}
                className={`free-item${selected === w.id ? ' is-selected' : ''}${problem ? ' has-problem' : ''}`}
                draggable
                onDragStart={(e) => { e.dataTransfer.setData(DRAG_MOVE, String(i)); e.dataTransfer.effectAllowed = 'move'; }}
                onDragOver={(e) => { e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); setDropAt(e.clientY < r.top + r.height / 2 ? i : i + 1); }}
                onDrop={(e) => onDrop(e, dropAt ?? i)}
              >
                <button type="button" className="free-item-main" onClick={() => setSelected(w.id)} aria-pressed={selected === w.id}>
                  <span className="hud-label">{WIDGETS[w.type].label}</span>
                  <span className="free-item-summary">{summary(w, images)}</span>
                </button>
                <span className="free-item-tools">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label="上へ">↑</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => move(i, i + 2)} disabled={i === widgets.length - 1} aria-label="下へ">↓</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => remove(w.id)} aria-label="削除">✕</button>
                </span>
              </li>,
              dropZone(i + 1),
            ];
          })}
        </ol>
        {widgets.length === 0 && <p className="empty">ウィジェットがありません。空のときは最後のページを表示しません。</p>}
      </section>

      <section className="panel free-inspector" aria-label="選んだ部品の設定">
        <p className="hud-label">EDIT</p>
        {!current && <p className="free-hint">ページの部品を選ぶと、ここで中身を変えられます。</p>}
        {current && (current.type === 'heading' || current.type === 'text' || current.type === 'note') && (
          <div className="form-group">
            <label htmlFor="free-text">{WIDGETS[current.type].label}</label>
            {current.type === 'text'
              ? <textarea id="free-text" rows={4} value={current.text} onChange={(e) => update(current.id, { text: e.target.value })} />
              : <input id="free-text" type="text" value={current.text} onChange={(e) => update(current.id, { text: e.target.value })} />}
            <p className="free-count mono-number">
              {countChars(current.text)} / {WIDGETS[current.type].maxChars}
              {WIDGETS[current.type].maxLines ? `（${WIDGETS[current.type].maxLines} 行まで）` : ''}
            </p>
          </div>
        )}
        {current?.type === 'link' && (
          <>
            <div className="form-group">
              <label htmlFor="free-label">表示する文字</label>
              <input id="free-label" type="text" value={current.label} onChange={(e) => update(current.id, { label: e.target.value })} />
              <p className="free-count mono-number">{countChars(current.label)} / {WIDGETS.link.maxChars}</p>
            </div>
            <div className="form-group">
              <label htmlFor="free-url">リンク先</label>
              <input id="free-url" type="text" inputMode="url" value={current.url} onChange={(e) => update(current.id, { url: e.target.value })} placeholder="https://… または /tags/…" />
              <p className="free-hint">雑誌のこのページを押すと、最初のリンクを開きます（サイトの外は新しいタブ）。</p>
            </div>
          </>
        )}
        {current?.type === 'image' && (
          <div className="free-images" role="listbox" aria-label="画像を選ぶ">
            {images.map((img) => (
              <button
                key={img.id}
                type="button"
                role="option"
                aria-selected={current.imageId === img.id}
                className={`free-image${current.imageId === img.id ? ' is-selected' : ''}`}
                onClick={() => update(current.id, { imageId: img.id })}
                title={img.title}
              >
                <img src={img.thumb} alt={img.title} loading="lazy" />
              </button>
            ))}
          </div>
        )}
        {current?.type === 'divider' && <p className="free-hint">区切り線には設定はありません。</p>}
        {current && widgetProblem(current) && <p className="free-problem">{widgetProblem(current)}</p>}
      </section>

      <section className="panel free-preview" aria-label="プレビュー">
        <p className="hud-label">PREVIEW</p>
        <div className="free-paper">
          <canvas ref={canvasRef} width={RENDER_W} height={RENDER_H} aria-label="最後のページのプレビュー" />
        </div>
        {problems.length > 0 && (
          <ul className="free-problems">
            {problems.map((p) => <li key={p}>{p}</li>)}
          </ul>
        )}
        <div className="row">
          <button type="button" className="btn btn-primary" onClick={save} disabled={saving || problems.length > 0}>
            {saving ? '保存中…' : '保存する'}
          </button>
        </div>
        {status && <p className={status.kind === 'ok' ? 'free-saved' : 'free-problem'} role="status">{status.text}</p>}
      </section>
    </div>
  );
}
