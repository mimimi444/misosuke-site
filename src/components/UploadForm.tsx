import { useState, useRef, useCallback } from 'react';
import { composePostText, countGraphemes, splitTagNames, POST_MAX_GRAPHEMES } from '../lib/social/compose';

interface FileItem {
  file: File;
  previewUrl: string;
  title: string;
  tagNames: string;
  postToBluesky: boolean;
  attachImage: boolean;
  includeLink: boolean;
  postText: string;
  /** 文面を手で編集したら true。以降はタイトルやタグに追従させない */
  postTextEdited: boolean;
}

interface Props {
  tagSuggestions: string[];
  siteUrl: string;
  /** アップロード完了後に移動する画像管理ページの URL */
  imagesHref: string;
}

type PostSetting = 'postToBluesky' | 'attachImage' | 'includeLink';

export default function UploadForm({ tagSuggestions, siteUrl, imagesHref }: Props) {
  const [items, setItems] = useState<FileItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [message, setMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef(false);
  const [dragging, setDragging] = useState(false);

  const addFiles = useCallback((files: File[]) => {
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    const newItems: FileItem[] = imageFiles.map(f => ({
      file: f,
      previewUrl: URL.createObjectURL(f),
      title: '',
      tagNames: '',
      postToBluesky: false,
      attachImage: true,
      includeLink: true,
      postText: '',
      postTextEdited: false,
    }));
    setItems(prev => [...prev, ...newItems]);
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    addFiles([...e.dataTransfer.files]);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = () => setDragging(false);

  const removeItem = (i: number) => {
    setItems(prev => {
      URL.revokeObjectURL(prev[i]!.previewUrl);
      return prev.filter((_, idx) => idx !== i);
    });
  };

  /** 手で編集していなければ、タイトル・タグ・リンク有無から文面を作り直す */
  const withComposedText = (item: FileItem): FileItem => {
    if (item.postTextEdited) return item;
    return {
      ...item,
      postText: composePostText({
        title: item.title,
        tagNames: splitTagNames(item.tagNames),
        url: item.includeLink ? siteUrl : null,
      }),
    };
  };

  const updateItem = (i: number, field: 'title' | 'tagNames', value: string) => {
    setItems(prev => prev.map((item, idx) => idx === i ? withComposedText({ ...item, [field]: value }) : item));
  };

  const updateSetting = (i: number, field: PostSetting, value: boolean) => {
    setItems(prev => prev.map((item, idx) => idx === i ? withComposedText({ ...item, [field]: value }) : item));
  };

  const resetPostText = (i: number) => {
    setItems(prev => prev.map((item, idx) => idx === i ? withComposedText({ ...item, postTextEdited: false }) : item));
  };

  const updatePostText = (i: number, value: string) => {
    setItems(prev => prev.map((item, idx) => idx === i ? { ...item, postText: value, postTextEdited: true } : item));
  };

  const handleSubmit = async () => {
    if (items.length === 0) return;
    setUploading(true);
    setProgress({ done: 0, total: items.length });

    let done = 0;
    for (const item of items) {
      const fd = new FormData();
      fd.append('file', item.file);
      if (item.title) fd.append('title', item.title);
      if (item.tagNames) fd.append('tagNames', item.tagNames);
      if (item.postToBluesky) {
        fd.append('postToBluesky', 'true');
        fd.append('attachImage', String(item.attachImage));
        fd.append('includeLink', String(item.includeLink));
        fd.append('postText', item.postText);
      }

      const res = await fetch('/_actions/uploadImage', { method: 'POST', body: fd });
      if (!res.ok) {
        setMessage(
          res.status === 413
            ? `エラー: ${item.file.name} はファイルサイズが大きすぎます（上限 25MB）`
            : res.status === 400
              ? `エラー: ${item.file.name} は対応していない形式です（JPG / PNG / WebP / GIF / AVIF / HEIC）`
              : `エラー: ${item.file.name} のアップロードに失敗しました（${res.status}）`,
        );
        setUploading(false);
        return;
      }
      done++;
      setProgress({ done, total: items.length });
    }

    setMessage(`${done} 枚のアップロードが完了しました`);
    setTimeout(() => { window.location.href = imagesHref; }, 1200);
  };

  const handleClear = () => {
    items.forEach(item => URL.revokeObjectURL(item.previewUrl));
    setItems([]);
  };

  if (uploading) {
    const pct = Math.round((progress.done / progress.total) * 100);
    return (
      <div className="progress-area">
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <p className="progress-text">
          {message || `${progress.done} / ${progress.total} をアップロード中...`}
        </p>
      </div>
    );
  }

  return (
    <div className="upload-area">
      {message && <p className="upload-message" role="alert">{message}</p>}
      <div
        className={`drop-zone${dragging ? ' drag-over' : ''}`}
        onClick={() => fileInputRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && fileInputRef.current?.click()}
        aria-label="画像ファイルをドロップまたはクリックして選択"
      >
        <div className="drop-icon">↑</div>
        <p className="drop-text">ここにドロップ、またはクリックして選択</p>
        <p className="drop-sub">複数ファイル対応（JPG / PNG / WebP / GIF）</p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={e => e.target.files && addFiles([...e.target.files])}
        />
      </div>

      {items.length > 0 && (
        <>
          <div className="preview-list">
            {items.map((item, i) => (
              <div key={item.previewUrl} className="preview-item">
                <div className="preview-thumb">
                  <img src={item.previewUrl} alt="" />
                  <button
                    type="button"
                    className="preview-remove"
                    onClick={() => removeItem(i)}
                    aria-label="削除"
                  >×</button>
                </div>
                <div className="preview-fields">
                  <div className="form-group">
                    <label htmlFor={`title-${i}`}>タイトル</label>
                    <input
                      id={`title-${i}`}
                      type="text"
                      placeholder="（任意）"
                      value={item.title}
                      onChange={e => updateItem(i, 'title', e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor={`tags-${i}`}>タグ（カンマ区切り）</label>
                    <input
                      id={`tags-${i}`}
                      type="text"
                      placeholder="例: キャラ名, 作品名"
                      value={item.tagNames}
                      onChange={e => updateItem(i, 'tagNames', e.target.value)}
                      list="tag-suggestions"
                    />
                  </div>
                  <fieldset className="bluesky-settings">
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={item.postToBluesky}
                        onChange={e => updateSetting(i, 'postToBluesky', e.target.checked)}
                      />
                      Blueskyに投稿する
                    </label>
                    <div className="bluesky-options">
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={item.attachImage}
                          disabled={!item.postToBluesky}
                          onChange={e => updateSetting(i, 'attachImage', e.target.checked)}
                        />
                        画像を添付
                      </label>
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={item.includeLink}
                          // 手で編集した文面にはリンクの有無を反映できないので、操作させない
                          disabled={!item.postToBluesky || item.postTextEdited}
                          onChange={e => updateSetting(i, 'includeLink', e.target.checked)}
                        />
                        サイトへのリンクを含める
                      </label>
                    </div>
                    <div className="form-group">
                      <label htmlFor={`post-text-${i}`}>文面</label>
                      <textarea
                        id={`post-text-${i}`}
                        value={item.postText}
                        disabled={!item.postToBluesky}
                        onChange={e => updatePostText(i, e.target.value)}
                      />
                      {item.postToBluesky && item.postTextEdited && (
                        <p className="post-edited-note">
                          文面を手で編集しています。リンクは文面の中で直接編集してください。
                          <button type="button" className="btn-link" onClick={() => resetPostText(i)}>
                            自動作成に戻す
                          </button>
                        </p>
                      )}
                      {(() => {
                        const count = countGraphemes(item.postText);
                        const over = count > POST_MAX_GRAPHEMES;
                        return (
                          <p className={`post-count${over ? ' over' : ''}`} aria-live="polite">
                            {count} / {POST_MAX_GRAPHEMES}
                            {over && '（超えた分は投稿時に切り詰めます）'}
                          </p>
                        );
                      })()}
                    </div>
                  </fieldset>
                </div>
              </div>
            ))}
          </div>

          <datalist id="tag-suggestions">
            {tagSuggestions.map(t => <option key={t} value={t} />)}
          </datalist>

          <div className="submit-row">
            <button type="button" className="btn btn-primary" onClick={handleSubmit}>
              アップロード ({items.length} 枚)
            </button>
            <button type="button" className="btn btn-ghost" onClick={handleClear}>
              クリア
            </button>
          </div>
        </>
      )}
    </div>
  );
}
