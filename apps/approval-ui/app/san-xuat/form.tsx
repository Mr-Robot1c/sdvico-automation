'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { generateTextForTitle, createContent } from '../actions';
import AssetUploader from './asset-uploader';
import ImageStudio from './image-studio';

type Asset = { id: string; kind: string; title: string; storage_path: string; url: string };
type Keyword = { id: string; keyword: string; intent: string | null; landing_url: string | null };

const INTENT_LABEL: Record<string, string> = {
  thong_tin: 'Thông tin',
  thuong_mai: 'So sánh',
  giao_dich: 'Giao dịch',
  dieu_huong: 'Điều hướng'
};

// Làm sạch tên tệp thành cụm từ khóa: bỏ timestamp đầu, bỏ đuôi file, đổi gạch/underscore thành khoảng trắng.
function cleanAssetName(s: string): string {
  return (s || '')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/^\d{10,}[-_]/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Gộp tên nhiều tệp (ảnh + video) thành một tiêu đề, ngăn bằng dấu cộng, bỏ trùng và phần rỗng.
function combineNames(...titles: (string | undefined)[]): string {
  const parts = titles.map((t) => cleanAssetName(t || '')).filter(Boolean);
  return [...new Set(parts)].join(' + ');
}

export default function SanXuatForm({
  images,
  videos,
  keywords
}: {
  images: Asset[];
  videos: Asset[];
  keywords: Keyword[];
}) {
  const [keywordId, setKeywordId] = useState<string>('');
  const [title, setTitle] = useState('');
  // Tiêu đề đang tự động theo tên ảnh/video (true) hay do người tự gõ/chọn từ khóa (false).
  const [titleAuto, setTitleAuto] = useState(true);
  const [draft, setDraft] = useState('');
  const [kind, setKind] = useState<'social' | 'article' | 'video'>('social');
  const [imgId, setImgId] = useState<string>('');
  const [vidId, setVidId] = useState<string>('');
  // Kênh đăng: Facebook mặc định; TikTok tùy chọn (cần video).
  const [postFb, setPostFb] = useState(true);
  const [postTt, setPostTt] = useState(false);
  const [genBusy, setGenBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const selectedImg = images.find((a) => a.id === imgId);
  const selectedVid = videos.find((a) => a.id === vidId);
  const selectedKw = useMemo(() => keywords.find((k) => k.id === keywordId), [keywords, keywordId]);

  const onSelectKeyword = (id: string) => {
    setKeywordId(id);
    const kw = keywords.find((k) => k.id === id);
    if (kw) {
      // Chọn từ khóa thì tiêu đề theo từ khóa, không tự đổi theo ảnh nữa.
      setTitle(kw.keyword);
      setTitleAuto(false);
    } else {
      // Bỏ từ khóa thì cho tên ảnh điều khiển lại tiêu đề.
      setTitleAuto(true);
    }
  };

  const runGenerate = async (
    kw: string,
    intent: string,
    landingUrl: string | null,
    assetHint: string,
    format: string = 'social'
  ) => {
    if (!kw.trim()) {
      setMsg('Chọn từ khóa trong kho, hoặc gõ tay tiêu đề trước khi sinh text.');
      return;
    }
    setGenBusy(true);
    setMsg('Đang sinh text theo từ khóa...');
    try {
      const t = await generateTextForTitle(kw, intent, landingUrl, assetHint, format);
      setDraft(t);
      setMsg(t ? 'Đã sinh xong. Sửa lại rồi bấm Xong để đẩy vào hàng đợi.' : 'Sinh xong nhưng không có text — thử từ khóa khác.');
    } catch (e: any) {
      setMsg('Lỗi sinh text: ' + (e?.message || e));
    } finally {
      setGenBusy(false);
    }
  };

  const onGenerate = () => {
    // Ưu tiên từ khóa/tiêu đề; nếu chưa có thì gộp tên ảnh + video làm nguồn để AI viết theo hình.
    const nameKw = combineNames(selectedImg?.title, selectedVid?.title);
    const kw = selectedKw?.keyword || title.trim() || nameKw;
    if (kw && !title.trim() && !selectedKw) setTitle(kw);
    // Gợi ý cho AI kèm cả tên ảnh và tên video (nếu có cả hai).
    const assetHint = [selectedImg?.title, selectedVid?.title].filter(Boolean).join(' / ');
    // kind là kênh đăng (social/article/video) — quyết định định dạng nội dung.
    return runGenerate(kw, selectedKw?.intent || 'giao_dich', selectedKw?.landing_url || null, assetHint, kind);
  };

  const onSubmit = (formData: FormData) => {
    formData.set('title', title);
    formData.set('draft', draft);
    formData.set('kind', kind);
    // Kênh đăng: TikTok chỉ khi có video được chọn.
    const chans: string[] = [];
    if (postFb) chans.push('facebook');
    if (postTt && vidId) chans.push('tiktok');
    formData.set('channels', chans.join(','));
    if (imgId) formData.set('image_asset_id', imgId);
    if (vidId) formData.set('video_asset_id', vidId);
    if (keywordId) formData.set('keyword_id', keywordId);
    if (selectedKw?.keyword) formData.set('keyword', selectedKw.keyword);
    if (selectedKw?.intent) formData.set('intent', selectedKw.intent);
    if (selectedKw?.landing_url) formData.set('landing_url', selectedKw.landing_url);
    startTransition(async () => {
      setMsg('Đang tạo khung sườn và đẩy vào hàng đợi duyệt...');
      try {
        await createContent(formData);
        setMsg('Xong. Nội dung đã ở Hàng đợi duyệt, chờ người bấm Duyệt để đăng.');
        setKeywordId('');
        setTitle('');
        setTitleAuto(true);
        setDraft('');
        setImgId('');
        setVidId('');
        setPostFb(true);
        setPostTt(false);
      } catch (e: any) {
        setMsg('Lỗi tạo: ' + (e?.message || e));
      }
    });
  };

  // Chọn ảnh: tiêu đề tự đổi, GỘP tên ảnh + video đang chọn (trừ khi người tự gõ tay hoặc đã chọn từ khóa).
  const onSelectImage = (a: Asset) => {
    const newId = a.id === imgId ? '' : a.id;
    setImgId(newId);
    if (!selectedKw && (titleAuto || !title.trim())) {
      const t = combineNames(newId ? a.title : '', selectedVid?.title);
      if (t) {
        setTitle(t);
        setTitleAuto(true);
      }
    }
  };

  // Chọn video: tương tự, gộp tên ảnh đang chọn + video này.
  const onSelectVideo = (a: Asset) => {
    const newId = a.id === vidId ? '' : a.id;
    setVidId(newId);
    if (!selectedKw && (titleAuto || !title.trim())) {
      const t = combineNames(selectedImg?.title, newId ? a.title : '');
      if (t) {
        setTitle(t);
        setTitleAuto(true);
      }
    }
  };

  return (
    <div className="sx-grid">
      <section className="sx-slot">
        <header className="sx-slot-head">
          <span className="sx-slot-title">Khung ảnh</span>
          <span className="muted">{images.length} ảnh trong kho</span>
        </header>

        <div className="sx-preview">
          {selectedImg ? (
            <img src={selectedImg.url} alt={selectedImg.title} />
          ) : (
            <div className="sx-preview-empty">
              <span aria-hidden="true">🖼️</span>
              <p>Chưa chọn ảnh</p>
            </div>
          )}
        </div>

        {selectedImg ? (
          <p className="muted sx-selected-name">
            Ảnh đang chọn: <b>{selectedImg.title}</b>{' '}
            <button type="button" className="btn ghost sm" onClick={() => setImgId('')}>
              ✕ Bỏ ảnh
            </button>
          </p>
        ) : null}

        {images.length > 0 ? (
          <div className="sx-thumbs" role="listbox" aria-label="Chọn ảnh từ kho">
            {images.slice(0, 12).map((a) => (
              <button
                key={a.id}
                type="button"
                className={`sx-thumb ${imgId === a.id ? 'on' : ''}`}
                onClick={() => onSelectImage(a)}
                aria-pressed={imgId === a.id}
                title={a.title}
              >
                <img src={a.url} alt={a.title} loading="lazy" />
              </button>
            ))}
          </div>
        ) : (
          <p className="muted">Kho ảnh đang trống. Tải ảnh lên bên dưới.</p>
        )}

        <AssetUploader kind="image" />
      </section>

      <section className="sx-slot">
        <header className="sx-slot-head">
          <span className="sx-slot-title">Khung video</span>
          <span className="muted">{videos.length} clip trong kho</span>
        </header>

        <div className="sx-preview">
          {selectedVid ? (
            <video src={selectedVid.url} controls preload="metadata" />
          ) : (
            <div className="sx-preview-empty">
              <span aria-hidden="true">🎬</span>
              <p>Chưa chọn video</p>
            </div>
          )}
        </div>

        {selectedVid ? (
          <p className="muted sx-selected-name">
            Video đang chọn: <b>{selectedVid.title}</b>{' '}
            <button type="button" className="btn ghost sm" onClick={() => setVidId('')}>
              ✕ Bỏ video
            </button>
          </p>
        ) : null}

        {videos.length > 0 ? (
          <div className="sx-thumbs" role="listbox" aria-label="Chọn video từ kho">
            {videos.slice(0, 8).map((a) => (
              <button
                key={a.id}
                type="button"
                className={`sx-thumb sx-thumb-video ${vidId === a.id ? 'on' : ''}`}
                onClick={() => onSelectVideo(a)}
                aria-pressed={vidId === a.id}
                title={a.title}
              >
                <video src={a.url} muted preload="metadata" />
                <span className="sx-thumb-badge" aria-hidden="true">▶</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="muted">Kho video đang trống. Tải video lên bên dưới.</p>
        )}

        <AssetUploader kind="video" />
      </section>

      <ImageStudio
        productId={imgId}
        productTitle={title || selectedKw?.keyword || ''}
        onAttach={(id, meta) => {
          const productName = selectedImg?.title || '';
          setImgId(id);
          router.refresh();
          if (meta?.banner) {
            // Ghép xong thì tự sinh text luôn: ưu tiên từ khóa/tiêu đề, không thì lấy tên ảnh mô tả.
            const kwText = (selectedKw?.keyword || title.trim() || cleanAssetName(productName)).trim();
            if (kwText && !genBusy) {
              if (!title.trim() && !selectedKw) setTitle(cleanAssetName(productName));
              setMsg('Đã ghép xong. Đang tự sinh text theo hình...');
              runGenerate(
                kwText,
                selectedKw?.intent || 'giao_dich',
                selectedKw?.landing_url || null,
                productName,
                kind
              );
            } else {
              setMsg('Đã ghép xong và gắn vào bài.');
            }
          } else {
            setMsg('Đã gắn ảnh vào bài.');
          }
        }}
      />

      <section className="sx-compose">
        <header className="sx-slot-head">
          <span className="sx-slot-title">Soạn bài viết</span>
        </header>

        <form action={onSubmit} className="sx-form">
          <label className="sx-field">
            <span>Từ khóa trong kho</span>
            <select
              className="note"
              value={keywordId}
              onChange={(e) => onSelectKeyword(e.target.value)}
              aria-label="Chọn từ khóa từ kho"
            >
              <option value="">— Chưa chọn từ khóa (có thể gõ tay tiêu đề bên dưới) —</option>
              {keywords.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.keyword}
                  {k.intent ? ` · ${INTENT_LABEL[k.intent] || k.intent}` : ''}
                </option>
              ))}
            </select>
            {selectedKw?.landing_url ? (
              <span className="muted">Trang đích: {selectedKw.landing_url}</span>
            ) : (
              <span className="muted">
                Thêm từ khóa mới ở <a className="src" href="/tu-khoa">Kho từ khóa</a>.
              </span>
            )}
          </label>

          <label className="sx-field">
            <span>Tiêu đề</span>
            <input
              className="note"
              value={title}
              onChange={(e) => { setTitle(e.target.value); setTitleAuto(false); }}
              placeholder="Ví dụ: lắp giám sát hành trình ở Bình Định"
              required
            />
          </label>

          <label className="sx-field">
            <span>Kênh đăng</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as any)} className="note">
              <option value="social">Facebook (bài ngắn)</option>
              <option value="article">Website (bài dài)</option>
              <option value="video">YouTube (kịch bản video)</option>
            </select>
          </label>

          <div className="sx-gen-row">
            <button
              type="button"
              className="btn ghost"
              onClick={onGenerate}
              disabled={genBusy || (!selectedKw && !title.trim() && !selectedImg && !selectedVid)}
            >
              {genBusy ? 'Đang sinh...' : '✨ Sinh text bằng AI'}
            </button>
            <span className="muted">
              Máy soạn nháp theo từ khóa đã chọn (hoặc theo tiêu đề nếu chưa chọn từ khóa). Người sửa lại trước khi đẩy hàng đợi.
            </span>
          </div>

          <label className="sx-field">
            <span>Nội dung bài</span>
            <textarea
              className="note"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={12}
              placeholder="Bấm Sinh text để máy soạn, hoặc gõ thẳng vào đây."
              required
            />
          </label>

          {kind === 'social' ? (
            <label className="sx-field">
              <span>Đăng lên</span>
              <span style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                  <input type="checkbox" checked={postFb} onChange={(e) => setPostFb(e.target.checked)} /> Facebook
                </label>
                <label
                  style={{ display: 'inline-flex', gap: 6, alignItems: 'center', opacity: vidId ? 1 : 0.5 }}
                  title={vidId ? '' : 'TikTok cần một video'}
                >
                  <input
                    type="checkbox"
                    checked={postTt && !!vidId}
                    disabled={!vidId}
                    onChange={(e) => setPostTt(e.target.checked)}
                  />{' '}
                  TikTok {vidId ? '' : '(cần video)'}
                </label>
              </span>
            </label>
          ) : null}

          <div className="sx-actions">
            <button
              type="submit"
              className="btn ok"
              disabled={pending || !title.trim() || !draft.trim()}
            >
              {pending ? 'Đang đẩy...' : '✅ Xong — đẩy vào hàng đợi duyệt'}
            </button>
            {msg ? <span className="muted">{msg}</span> : null}
          </div>

          <p className="sx-note">
            Nút <b>Xong</b> chỉ tạo khung sườn và đưa vào hàng đợi duyệt. Nội dung chưa lên trang mạng xã hội —
            người duyệt phải bấm <b>Duyệt</b> ở tab Hàng đợi duyệt thì mới thực sự đăng. Điều cấm 1: máy soạn, người bấm.
          </p>
        </form>
      </section>
    </div>
  );
}
