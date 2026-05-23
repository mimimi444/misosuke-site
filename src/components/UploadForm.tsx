import { useState, useRef, useCallback } from 'react';

interface FileItem {
  file: File;
  previewUrl: string;
  title: string;
  tagNames: string;
}

interface Props {
  tagSuggestions: string[];
}

export default function UploadForm({ tagSuggestions }: Props) {
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

  const updateItem = (i: number, field: 'title' | 'tagNames', value: string) => {
    setItems(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: value } : item));
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

      const res = await fetch('/_actions/uploadImage', { method: 'POST', body: fd });
      if (!res.ok) {
        setMessage(`エラー: ${item.file.name} のアップロードに失敗しました`);
        setUploading(false);
        return;
      }
      done++;
      setProgress({ done, total: items.length });
    }

    setMessage(`${done} 枚のアップロードが完了しました`);
    setTimeout(() => { window.location.href = '/admin/images'; }, 1200);
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
