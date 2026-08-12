'use client';

import { useState } from 'react';
import { searchUnsplash, saveUnsplashAsAsset, createBannerFromBackground } from '../actions';

type UnsplashItem = {
  id: string;
  thumb: string;
  regular: string;
  downloadLocation?: string;
  author?: string;
  authorUrl?: string;
};

// Xưởng ảnh: tìm ảnh nền trên Unsplash, chèn thẳng làm ảnh minh họa, hoặc ghép ảnh sản phẩm
// đã chọn lên nền đó thành banner bài đăng. Sau khi tạo, tự gắn vào bài (onAttach).
export default function ImageStudio({
  productId,
  productTitle,
  onAttach
}: {
  productId: string;
  productTitle: string;
  onAttach: (assetId: string, meta?: { banner?: boolean }) => void;
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
      setMsg(r.length ? `Tìm thấy ${r.length} ảnh. Bấm "Chèn" để dùng, hoặc "Ghép sản phẩm" để tạo banner.` : 'Không thấy ảnh nào, thử từ khóa tiếng Anh.');
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

  const onCompose = async (it: UnsplashItem | null) => {
    if (!productId) {
      setMsg('Chọn 1 ảnh sản phẩm ở trên trước khi ghép banner.');
      return;
    }
    setBusy('cmp-' + (it?.id || 'brand'));
    setMsg('Đang ghép banner (giữ nguyên sản phẩm, thêm nền và chữ)...');
    try {
      const res = await createBannerFromBackground({
        productAssetId: productId,
        background: it?.regular,
        downloadLocation: it?.downloadLocation,
        title: productTitle,
        author: it?.author
      });
      onAttach(res.id, { banner: true });
      setMsg('Đã tạo banner và gắn vào bài. Xem khung ảnh ở trên.');
    } catch (e: any) {
      setMsg('Lỗi ghép banner: ' + (e?.message || e));
    } finally {
      setBusy('');
    }
  };

  return (
    <section className="sx-compose">
      <header className="sx-slot-head">
        <span className="sx-slot-title">Xưởng ảnh — Unsplash & ghép banner</span>
      </header>

      <div className="studio-row">
        <input
          className="note"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onSearch(); } }}
          placeholder="Từ khóa tìm ảnh nền (nên gõ tiếng Anh: fishing boat, ocean, harbor...)"
          aria-label="Từ khóa Unsplash"
        />
        <button type="button" className="btn ghost" onClick={onSearch} disabled={!!busy}>
          {busy === 'search' ? 'Đang tìm...' : '🔎 Tìm ảnh Unsplash'}
        </button>
        <button
          type="button"
          className="btn ok"
          onClick={() => onCompose(null)}
          disabled={!!busy || !productId}
          title={productId ? '' : 'Chọn ảnh sản phẩm trước'}
        >
          🎨 Ghép banner nền thương hiệu
        </button>
      </div>

      {results.length ? (
        <div className="studio-grid">
          {results.map((it) => (
            <div className="studio-card" key={it.id}>
              <img src={it.thumb} alt={it.author ? `Ảnh của ${it.author}` : 'Ảnh Unsplash'} loading="lazy" />
              <div className="studio-card-actions">
                <button type="button" className="btn ghost sm" onClick={() => onInsert(it)} disabled={!!busy}>
                  {busy === 'ins-' + it.id ? '...' : 'Chèn ảnh'}
                </button>
                <button
                  type="button"
                  className="btn ok sm"
                  onClick={() => onCompose(it)}
                  disabled={!!busy || !productId}
                  title={productId ? '' : 'Chọn ảnh sản phẩm trước'}
                >
                  {busy === 'cmp-' + it.id ? '...' : 'Ghép sản phẩm'}
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
        của SDVICO. Banner ghép luôn giữ nguyên ảnh sản phẩm, không vẽ lại (điều cấm 5).
      </p>
    </section>
  );
}
