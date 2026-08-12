'use client';

import { useState } from 'react';
import { searchUnsplash, saveUnsplashAsAsset, createCompositeFromBackground } from '../actions';

type UnsplashItem = {
  id: string;
  thumb: string;
  regular: string;
  downloadLocation?: string;
  author?: string;
  authorUrl?: string;
};

// Tìm ảnh nền trên Unsplash. Chèn thẳng làm ảnh minh họa, hoặc GHÉP: cắt nền ảnh sản phẩm đã chọn
// (remove.bg) rồi đặt lên nền đó thành một ảnh — sản phẩm nằm trong cảnh, không "trồng chất lên".
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
    setMsg('Đang tìm ảnh nền trên Unsplash...');
    try {
      const q = query.trim() || productTitle.trim() || 'ocean sea sky';
      const r = await searchUnsplash(q);
      setResults(r);
      setMsg(r.length ? `Tìm thấy ${r.length} ảnh. "Chèn ảnh" để dùng ảnh nền, hoặc "Ghép sản phẩm" để cắt nền sản phẩm rồi ghép lên.` : 'Không thấy ảnh nào, thử từ khóa tiếng Anh.');
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

  const onCompose = async (it: UnsplashItem) => {
    if (!productId) {
      setMsg('Chọn 1 ảnh sản phẩm ở khung ảnh phía trên trước khi ghép.');
      return;
    }
    setBusy('cmp-' + it.id);
    setMsg('Đang cắt nền sản phẩm và ghép lên ảnh nền...');
    try {
      const res = await createCompositeFromBackground({
        productAssetId: productId,
        background: it.regular,
        downloadLocation: it.downloadLocation,
        title: productTitle,
        author: it.author
      });
      onAttach(res.id, { banner: true });
      setMsg('Đã ghép xong và gắn vào bài. Xem khung ảnh ở trên.');
    } catch (e: any) {
      setMsg('Lỗi ghép: ' + (e?.message || e));
    } finally {
      setBusy('');
    }
  };

  return (
    <section className="sx-compose">
      <header className="sx-slot-head">
        <span className="sx-slot-title">Xưởng ảnh — tìm nền & ghép sản phẩm</span>
      </header>

      <div className="studio-row">
        <input
          className="note"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onSearch(); } }}
          placeholder="Từ khóa tìm ảnh nền (nên gõ tiếng Anh: ocean, fishing boat, harbor...)"
          aria-label="Từ khóa Unsplash"
        />
        <button type="button" className="btn ghost" onClick={onSearch} disabled={!!busy}>
          {busy === 'search' ? 'Đang tìm...' : '🔎 Tìm ảnh nền'}
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
                  title={productId ? 'Cắt nền sản phẩm rồi ghép lên nền này' : 'Chọn ảnh sản phẩm trước'}
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
        "Ghép sản phẩm" sẽ cắt nền ảnh sản phẩm bạn đang chọn (bằng remove.bg) rồi đặt lên ảnh nền, ra một
        tấm ảnh sản phẩm nằm trong cảnh. Đặt tên ảnh sản phẩm mô tả rõ để phần Sinh text viết bám theo hình.
      </p>
    </section>
  );
}
