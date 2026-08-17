'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { generateTextForTitle, createContent, checkVideoDone } from '../actions';
// @ts-ignore — module JS thuần, không có .d.ts
import { guessGroup } from '../../lib/gen/products.mjs';
import AssetUploader from './asset-uploader';
import ImageStudio from './image-studio';

type Asset = { id: string; kind: string; title: string; storage_path: string; url: string };

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

// Tên sản phẩm gọn từ nhãn folder ("6. Thiết bị lọc dầu SF-50" -> "Thiết bị lọc dầu SF-50").
function productNameOf(group: string): string {
  return (group || '').replace(/^\s*\d+\.\s*/, '').trim();
}

// Tiêu đề khi có cả ảnh và video: nếu cả hai cùng chỉ về MỘT sản phẩm (đoán qua tên tệp) thì dùng
// TÊN SẢN PHẨM gọn (một chủ đề) để AI viết một bài hoàn chỉnh, thay vì ghép "A + B" khiến AI tưởng
// hai sản phẩm khác nhau. Khác sản phẩm thật, hoặc chỉ một media, thì giữ như cũ.
function unifiedTitle(imgTitle?: string, vidTitle?: string): string {
  if (imgTitle && vidTitle) {
    const g1 = (guessGroup as (s: string) => string | null)(imgTitle);
    const g2 = (guessGroup as (s: string) => string | null)(vidTitle);
    const g = g1 && (g1 === g2 || !g2) ? g1 : (!g1 && g2 ? g2 : null);
    if (g) return productNameOf(g);
  }
  return combineNames(imgTitle, vidTitle);
}

export default function SanXuatForm({
  images,
  videos
}: {
  images: Asset[];
  videos: Asset[];
}) {
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
  // Loại content để so sánh A/B (tips/bán hàng/review/UGC).
  const [contentType, setContentType] = useState<string>('tips');
  const [genBusy, setGenBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  // Tiến trình dựng video sau khi bấm "Xong + Làm video". Client polling checkVideoDone mỗi 20s
  // (máy nội bộ dựng ~5 phút). Xong -> hiện link + video xem tại chỗ. Quá lâu -> nhắc kiểm tra máy.
  const [videoJob, setVideoJob] = useState<{
    sourceId: string; status: 'waiting' | 'done' | 'timeout';
    startedAt: number; videoUrl?: string; queueUrl?: string; title?: string;
  } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!videoJob || videoJob.status !== 'waiting') return;
    // Poll ngay + mỗi 20s. Máy nội bộ dựng ~5 phút; timeout 15 phút (~45 lượt) rồi nhắc.
    const tick = async () => {
      try {
        const r = await checkVideoDone(videoJob.sourceId);
        if (r.done) {
          setVideoJob((v) => v ? { ...v, status: 'done', videoUrl: r.videoUrl, queueUrl: r.url, title: r.title } : v);
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        } else if (Date.now() - videoJob.startedAt > 15 * 60 * 1000) {
          setVideoJob((v) => v ? { ...v, status: 'timeout' } : v);
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        }
      } catch { /* mạng chập chờn, thử lại lượt sau */ }
    };
    tick();
    pollRef.current = setInterval(tick, 20000);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [videoJob?.sourceId, videoJob?.status]);

  const selectedImg = images.find((a) => a.id === imgId);
  const selectedVid = videos.find((a) => a.id === vidId);

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
      const t = await generateTextForTitle(kw, intent, landingUrl, assetHint, format, contentType);
      setDraft(t);
      setMsg(t ? 'Đã sinh xong. Sửa lại rồi bấm Xong để đẩy vào hàng đợi.' : 'Sinh xong nhưng không có text — thử từ khóa khác.');
    } catch (e: any) {
      setMsg('Lỗi sinh text: ' + (e?.message || e));
    } finally {
      setGenBusy(false);
    }
  };

  const onGenerate = () => {
    // Tiêu đề do người gõ; nếu chưa có thì hợp nhất tên ảnh + video (cùng sản phẩm -> một chủ đề).
    const nameKw = unifiedTitle(selectedImg?.title, selectedVid?.title);
    const kw = title.trim() || nameKw;
    if (kw && !title.trim()) setTitle(kw);
    // Gợi ý cho AI kèm cả tên ảnh và tên video (nếu có cả hai).
    const assetHint = [selectedImg?.title, selectedVid?.title].filter(Boolean).join(' / ');
    // kind là kênh đăng (social/article/video) — quyết định định dạng nội dung.
    return runGenerate(kw, 'giao_dich', null, assetHint, kind);
  };

  const submitCore = (opts: { requestVideo: boolean }) => {
    const fd = new FormData();
    fd.set('title', title);
    fd.set('draft', draft);
    fd.set('kind', kind);
    const chans: string[] = [];
    if (postFb) chans.push('facebook');
    if (postTt && vidId) chans.push('tiktok');
    fd.set('channels', chans.join(','));
    fd.set('content_type', contentType);
    if (imgId) fd.set('image_asset_id', imgId);
    if (vidId) fd.set('video_asset_id', vidId);
    if (opts.requestVideo) fd.set('request_video', '1');
    startTransition(async () => {
      setMsg(opts.requestVideo ? 'Đang lưu bài + yêu cầu làm video...' : 'Đang tạo khung sườn và đẩy vào hàng đợi duyệt...');
      try {
        const res = await createContent(fd);
        if (opts.requestVideo && res?.contentId) {
          // Bật panel tiến trình; các state khác reset để soạn bài tiếp.
          setVideoJob({ sourceId: res.contentId, status: 'waiting', startedAt: Date.now() });
          setMsg('');
        } else {
          setMsg('Xong. Nội dung đã ở Hàng đợi duyệt, chờ người bấm Duyệt để đăng.');
        }
        setTitle('');
        setTitleAuto(true);
        setDraft('');
        setImgId('');
        setVidId('');
        setPostFb(true);
        setPostTt(false);
        setContentType('tips');
      } catch (e: any) {
        setMsg('Lỗi tạo: ' + (e?.message || e));
      }
    });
  };
  const onSubmit = () => submitCore({ requestVideo: false });

  // Chọn ảnh: tiêu đề tự đổi, GỘP tên ảnh + video đang chọn (trừ khi người tự gõ tay hoặc đã chọn từ khóa).
  const onSelectImage = (a: Asset) => {
    const newId = a.id === imgId ? '' : a.id;
    setImgId(newId);
    if (titleAuto || !title.trim()) {
      const t = unifiedTitle(newId ? a.title : '', selectedVid?.title);
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
    if (titleAuto || !title.trim()) {
      const t = unifiedTitle(selectedImg?.title, newId ? a.title : '');
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
            {images.map((a) => (
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
            {videos.map((a) => (
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
        productTitle={title || ''}
        onAttach={(id, meta) => {
          const productName = selectedImg?.title || '';
          setImgId(id);
          router.refresh();
          if (meta?.banner) {
            // Ghép xong thì tự sinh text luôn: ưu tiên tiêu đề, không thì lấy tên ảnh mô tả.
            const kwText = (title.trim() || cleanAssetName(productName)).trim();
            if (kwText && !genBusy) {
              if (!title.trim()) setTitle(cleanAssetName(productName));
              setMsg('Đã ghép xong. Đang tự sinh text theo hình...');
              runGenerate(
                kwText,
                'giao_dich',
                null,
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

        <form action={() => onSubmit()} className="sx-form">
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
            <span>Độ dài text</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as any)} className="note">
              <option value="social">Bài ngắn</option>
              <option value="article">Bài dài</option>
              <option value="video">Kịch bản video</option>
            </select>
          </label>

          <label className="sx-field">
            <span>Loại content (để so sánh hiệu quả)</span>
            <select value={contentType} onChange={(e) => setContentType(e.target.value)} className="note">
              <option value="tips">Tips / Giáo dục</option>
              <option value="sales">Bán hàng trực tiếp</option>
              <option value="review">Review</option>
              <option value="ugc">UGC (khách hàng)</option>
              <option value="other">Khác</option>
            </select>
          </label>

          <div className="sx-gen-row">
            <button
              type="button"
              className="btn ghost"
              onClick={onGenerate}
              disabled={genBusy || (!title.trim() && !selectedImg && !selectedVid)}
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
            {kind === 'article' && postTt && vidId ? (
              <span style={{ color: '#d97706', fontSize: '.8rem' }}>
                ⚠️ Bài dài không hợp TikTok, caption sẽ bị rút gọn. Nên chọn "Bài ngắn" hoặc "Kịch bản video" khi đăng TikTok.
              </span>
            ) : null}
          </label>

          <div className="sx-actions" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="submit"
              className="btn ok"
              disabled={pending || !title.trim() || !draft.trim()}
            >
              {pending ? 'Đang đẩy...' : '✅ Xong — đẩy vào hàng đợi duyệt'}
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => submitCore({ requestVideo: true })}
              disabled={pending || !title.trim() || !draft.trim()}
              title="Lưu bài + yêu cầu GitHub Actions dựng video (FB 16:9 + TikTok dọc). Mất ~8 phút, không cần bật máy."
            >
              {pending ? 'Đang đẩy...' : '🎬 Xong + Làm video (~8 phút)'}
            </button>
            {msg ? <span className="muted">{msg}</span> : null}
          </div>

          {videoJob ? (
            <div className={`videojob videojob-${videoJob.status}`} style={{
              marginTop: 12, padding: 12, borderRadius: 8,
              background: videoJob.status === 'done' ? 'rgba(22,163,74,.08)' : videoJob.status === 'timeout' ? 'rgba(217,119,6,.08)' : 'rgba(59,130,246,.08)',
              border: `1px solid ${videoJob.status === 'done' ? '#16a34a55' : videoJob.status === 'timeout' ? '#d9770655' : '#3b82f655'}`
            }}>
              {videoJob.status === 'waiting' ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="spinner" aria-hidden="true" style={{
                      display: 'inline-block', width: 16, height: 16, border: '2px solid #3b82f6',
                      borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite'
                    }} />
                    <b>Đang dựng video...</b>
                    <span className="muted">GitHub Actions đang làm (~8 phút). Trang sẽ tự cập nhật.</span>
                  </div>
                  <p className="muted" style={{ marginTop: 6, fontSize: '.85rem' }}>
                    Chạy trên cloud của GitHub, không cần bật máy nào. Cứ để trang mở hoặc quay lại sau.
                  </p>
                </>
              ) : videoJob.status === 'done' ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span>🎉</span>
                    <b>Video đã dựng xong!</b>
                    {videoJob.title ? <span className="muted">— {videoJob.title}</span> : null}
                    {videoJob.queueUrl ? (
                      <a className="btn ok sm" href={videoJob.queueUrl}>Xem ở Hàng đợi duyệt</a>
                    ) : null}
                    <button type="button" className="btn ghost sm" onClick={() => setVideoJob(null)}>✕ Đóng</button>
                  </div>
                  {videoJob.videoUrl ? (
                    <video src={videoJob.videoUrl} controls preload="metadata" style={{ marginTop: 10, maxWidth: '100%', maxHeight: 380, borderRadius: 6 }} />
                  ) : null}
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span>⏱️</span>
                    <b>Đã đợi hơn 15 phút mà chưa xong.</b>
                    <button type="button" className="btn ghost sm" onClick={() => setVideoJob(null)}>✕ Đóng</button>
                  </div>
                  <p className="muted" style={{ marginTop: 6, fontSize: '.85rem' }}>
                    GitHub Actions có thể đang xếp hàng (khi nhiều workflow chạy cùng lúc). Yêu cầu vẫn còn, sẽ tự dựng khi tới lượt.
                    Xem tiến trình ở GitHub Actions tab của repo.
                  </p>
                </>
              )}
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </div>
          ) : null}

          <p className="sx-note">
            Nút <b>Xong</b> chỉ tạo khung sườn và đưa vào hàng đợi duyệt. Nội dung chưa lên trang mạng xã hội —
            người duyệt phải bấm <b>Duyệt</b> ở tab Hàng đợi duyệt thì mới thực sự đăng. Điều cấm 1: máy soạn, người bấm.
          </p>
        </form>
      </section>
    </div>
  );
}
