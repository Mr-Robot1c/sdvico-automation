'use client';

import { useState } from 'react';
import { searchUnsplash, saveUnsplashAsAsset } from '../actions';

type UnsplashItem = {
  id: string;
  thumb: string;
  regular: string;
  downloadLocation?: string;
  author?: string;
  authorUrl?: string;
};

// Tìm ảnh minh họa trên Unsplash và chèn thẳng làm ảnh bài đăng. Không ghép/đóng khung —
// ảnh dùng nguyên bản (ảnh chụp thật miễn phí, hợp làm nền hoặc minh họa).
export default function ImageStudio({
  productTitle,
  onAttach
}: {
  productTitle: string;
  onAttach: (assetId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UnsplashItem[]>([]);
  const [busy, setBusy] = useState<string>('');
  const [msg, setMsg] = useState('');

  const onSearch = async () => {
    setBusy('search');
    setMsg('Đang tìm ảnh trên Unsplash...');
    try {
      const q = query.trim() || productTitle.trim() || 'fishing boat sea';
      const r = await searchUnsplash(q);
      setResults(r);
      setMsg(r.length ? `Tìm thấy ${r.length} ảnh. Bấm "Chèn ảnh" để dùng làm ảnh bài.` : 'Không thấy ảnh nào, thử từ khóa tiếng Anh.');
    } catch (e: any) {
      setMsg('Lỗi tìm ảnh: ' + (e?.message || e));
    } finally {
      setBusy('');
    }
  };

  const onInsert = async (it: UnsplashItem) => {
    setBusy('ins-' + it.id);
    setMsg('Đang lưu ảnh Unsplash vào kho...');
    try {
      const res = await saveUnsplashAsAsset({
        regular: it.regular,
        downloadLocation: it.downloadLocation,
        author: it.author,
        title: (query || productTitle || 'anh') + '-unsplash'
      });
      onAttach(res.id);
      setMsg('Đã chèn ảnh vào bài.');
    } catch (e: any) {
      setMsg('Lỗi chèn ảnh: ' + (e?.message || e));
    } finally {
      setBusy('');
    }
  };

  return (
    <section className="sx-compose">
      <header className="sx-slot-head">
        <span className="sx-slot-title">Tìm ảnh minh họa (Unsplash)</span>
      </header>

      <div className="studio-row">
        <input
          className="note"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onSearch(); } }}
          placeholder="Từ khóa tìm ảnh (nên gõ tiếng Anh: fishing boat, ocean, harbor...)"
          aria-label="Từ khóa Unsplash"
        />
        <button type="button" className="btn ghost" onClick={onSearch} disabled={!!busy}>
          {busy === 'search' ? 'Đang tìm...' : '🔎 Tìm ảnh Unsplash'}
        </button>
      </div>

      {results.length ? (
        <div className="studio-grid">
          {results.map((it) => (
            <div className="studio-card" key={it.id}>
              <img src={it.thumb} alt={it.author ? `Ảnh của ${it.author}` : 'Ảnh Unsplash'} loading="lazy" />
              <div className="studio-card-actions">
                <button type="button" className="btn ok sm" onClick={() => onInsert(it)} disabled={!!busy}>
                  {busy === 'ins-' + it.id ? '...' : 'Chèn ảnh'}
                </button>
              </div>
              {it.author ? <span className="studio-credit">Ảnh: {it.author} / Unsplash</span> : null}
            </div>
          ))}
        </div>
      ) : null}

      {msg ? <p className="muted">{msg}</p> : null}
      <p className="sx-note">
        Ảnh Unsplash là ảnh chụp thật miễn phí, hợp làm nền hoặc minh họa. Ảnh sản phẩm cụ thể vẫn nên dùng ảnh thật
        của SDVICO (tải lên ở khung ảnh phía trên). Đặt tên ảnh mô tả rõ để nút Sinh text viết bám theo hình.
      </p>
    </section>
  );
}
