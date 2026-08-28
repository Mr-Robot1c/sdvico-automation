'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { generateTextForTitle, createContent, checkVideoDone } from '../actions';
// @ts-ignore — module JS thuần, không có .d.ts
import { guessGroup } from '../../lib/gen/products.mjs';
import AssetUploader from './asset-uploader';
import ImageStudio from './image-studio';

type Asset = { id: string; kind: string; title: string; storage_path: string; url: string; product_group: string | null };

// Làm sạch tên tệp thành cụm từ khóa: bỏ timestamp đầu, bỏ đuôi file, đổi gạch/underscore thành khoảng trắng.
function cleanAssetName(s: string): string {
  return (s || '')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/^\d{10,}[-_]/, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function combineNames(...titles: (string | undefined)[]): string {
  const parts = titles.map((t) => cleanAssetName(t || '')).filter(Boolean);
  return [...new Set(parts)].join(' + ');
}

function productNameOf(group: string): string {
  return (group || '').replace(/^\s*\d+\.\s*/, '').trim();
}

// Tiêu đề khi có cả ảnh và video: cả hai cùng chỉ về MỘT sản phẩm -> dùng tên sản phẩm gọn.
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
  const [titleAuto, setTitleAuto] = useState(true);
  const [draft, setDraft] = useState('');
  const [kind, setKind] = useState<'social' | 'article' | 'video'>('social');
  // Multi-select: chọn NHIỀU ảnh + NHIỀU video. Video đầu là bài chính, ảnh dư thả bình luận.
  const [imgIds, setImgIds] = useState<string[]>([]);
  const [vidIds, setVidIds] = useState<string[]>([]);
  // Ảnh/video đang XEM TO ở preview (ưu tiên hơn ảnh chọn đầu tiên). Đổi khi click bất kỳ
  // thumbnail hoặc nút 🔍 - kể cả khi chỉ xem không chọn.
  const [previewImgId, setPreviewImgId] = useState<string>('');
  const [previewVidId, setPreviewVidId] = useState<string>('');
  // Lightbox: xem to gần full màn hình (bấm 🔍 hoặc phím Esc để đóng).
  const [lightbox, setLightbox] = useState<{ kind: 'image' | 'video'; url: string; title: string } | null>(null);
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);
  // Filter theo folder sản phẩm để khung ảnh/video không rối. '' = tất cả.
  const [folder, setFolder] = useState<string>('');
  const [postFb, setPostFb] = useState(true);
  const [postTt, setPostTt] = useState(false);
  const [contentType, setContentType] = useState<string>('tips');
  const [genBusy, setGenBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  // Panel tiến trình sau khi "Xong + Làm video". Polling checkVideoDone mỗi 20s.
  const [videoJob, setVideoJob] = useState<{
    sourceId: string; status: 'waiting' | 'done' | 'timeout';
    startedAt: number; videoUrl?: string; queueUrl?: string; title?: string;
  } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!videoJob || videoJob.status !== 'waiting') return;
    const tick = async () => {
      try {
        const r = await checkVideoDone(videoJob.sourceId);
        if (r.done) {
          setVideoJob((v) => v ? { ...v, status: 'done', videoUrl: r.videoUrl, queueUrl: r.url, title: r.title } : v);
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        } else if (Date.now() - videoJob.startedAt > 30 * 60 * 1000) {
          setVideoJob((v) => v ? { ...v, status: 'timeout' } : v);
          if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        }
      } catch { /* mạng chập chờn, thử lại lượt sau */ }
    };
    tick();
    pollRef.current = setInterval(tick, 20000);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [videoJob?.sourceId, videoJob?.status]);

  // Danh sách asset đã chọn (giữ đúng thứ tự bấm).
  const selectedImgs = imgIds.map((id) => images.find((a) => a.id === id)).filter(Boolean) as Asset[];
  const selectedVids = vidIds.map((id) => videos.find((a) => a.id === id)).filter(Boolean) as Asset[];
  const firstImg = selectedImgs[0];
  const firstVid = selectedVids[0];
  // Ảnh/video hiển thị ở khung preview to: ưu tiên cái đang xem, fallback về ảnh chọn đầu tiên.
  const previewImg = images.find((a) => a.id === previewImgId) || firstImg;
  const previewVid = videos.find((a) => a.id === previewVidId) || firstVid;
  // Chip filter theo folder (chỉ folder thật sự có tư liệu).
  const folderList = Array.from(new Set(
    [...images, ...videos].map((a) => a.product_group).filter((g): g is string => Boolean(g))
  )).sort();
  const filterByFolder = <T extends { product_group: string | null }>(arr: T[]) =>
    folder ? arr.filter((a) => a.product_group === folder) : arr;
  const shownImages = filterByFolder(images);
  const shownVideos = filterByFolder(videos);
  const imgOrder = (id: string) => imgIds.indexOf(id) + 1;
  const vidOrder = (id: string) => vidIds.indexOf(id) + 1;

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
    const nameKw = unifiedTitle(firstImg?.title, firstVid?.title);
    const kw = title.trim() || nameKw;
    if (kw && !title.trim()) setTitle(kw);
    const assetHint = [...selectedImgs.map((a) => a.title), ...selectedVids.map((a) => a.title)].filter(Boolean).join(' / ');
    return runGenerate(kw, 'giao_dich', null, assetHint, kind);
  };

  const submitCore = (opts: { requestVideo: boolean }) => {
    const fd = new FormData();
    fd.set('title', title);
    fd.set('draft', draft);
    fd.set('kind', kind);
    const chans: string[] = [];
    if (postFb) chans.push('facebook');
    if (postTt && vidIds.length) chans.push('tiktok');
    fd.set('channels', chans.join(','));
    fd.set('content_type', contentType);
    // Nhiều ảnh/video: id đầu tiên (backward compat) + toàn bộ dạng CSV.
    if (imgIds.length) { fd.set('image_asset_id', imgIds[0]); fd.set('image_asset_ids', imgIds.join(',')); }
    if (vidIds.length) { fd.set('video_asset_id', vidIds[0]); fd.set('video_asset_ids', vidIds.join(',')); }
    if (opts.requestVideo) fd.set('request_video', '1');
    startTransition(async () => {
      setMsg(opts.requestVideo ? 'Đang lưu bài + yêu cầu làm video...' : 'Đang tạo khung sườn và đẩy vào hàng đợi duyệt...');
      try {
        const res = await createContent(fd);
        if (opts.requestVideo && res?.contentId) {
          setVideoJob({ sourceId: res.contentId, status: 'waiting', startedAt: Date.now() });
          setMsg('');
        } else {
          setMsg('Xong. Nội dung đã ở Hàng đợi duyệt, chờ người bấm Duyệt để đăng.');
        }
        setTitle('');
        setTitleAuto(true);
        setDraft('');
        setImgIds([]);
        setVidIds([]);
        setPreviewImgId('');
        setPreviewVidId('');
        setPostFb(true);
        setPostTt(false);
        setContentType('tips');
      } catch (e: any) {
        setMsg('Lỗi tạo: ' + (e?.message || e));
      }
    });
  };
  const onSubmit = () => submitCore({ requestVideo: false });

  // Toggle chọn/bỏ ảnh. Đồng thời cập nhật preview to = ảnh vừa click (để coi được).
  const onSelectImage = (a: Asset) => {
    const has = imgIds.includes(a.id);
    const newIds = has ? imgIds.filter((id) => id !== a.id) : [...imgIds, a.id];
    setImgIds(newIds);
    setPreviewImgId(a.id); // luôn hiện to ảnh vừa tương tác
    if (titleAuto || !title.trim()) {
      const firstImgTitle = images.find((x) => x.id === newIds[0])?.title;
      const t = unifiedTitle(firstImgTitle, firstVid?.title);
      if (t) { setTitle(t); setTitleAuto(true); }
    }
  };

  const onSelectVideo = (a: Asset) => {
    const has = vidIds.includes(a.id);
    const newIds = has ? vidIds.filter((id) => id !== a.id) : [...vidIds, a.id];
    setVidIds(newIds);
    setPreviewVidId(a.id);
    if (titleAuto || !title.trim()) {
      const firstVidTitle = videos.find((x) => x.id === newIds[0])?.title;
      const t = unifiedTitle(firstImg?.title, firstVidTitle);
      if (t) { setTitle(t); setTitleAuto(true); }
    }
  };

  return (
    <div className="sx-grid">
      {/* Bộ lọc CHUNG theo folder sản phẩm — gọn khung ảnh/video, tránh rối. */}
      {folderList.length > 1 ? (
        <div style={{ gridColumn: '1 / -1', display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', padding: '8px 0' }}>
          <span className="muted" style={{ marginRight: 6 }}>📁 Lọc theo folder:</span>
          <button type="button" className={`chip ${folder === '' ? 'on' : ''}`} onClick={() => setFolder('')}>
            Tất cả <span className="n">{images.length + videos.length}</span>
          </button>
          {folderList.map((g) => {
            const n = images.filter((a) => a.product_group === g).length + videos.filter((a) => a.product_group === g).length;
            const short = g.replace(/^\s*\d+\.\s*/, '').replace(/^(.{22}).+/, '$1…');
            return (
              <button key={g} type="button" className={`chip ${folder === g ? 'on' : ''}`} onClick={() => setFolder(g)} title={g}>
                {short} <span className="n">{n}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      <section className="sx-slot">
        <header className="sx-slot-head">
          <span className="sx-slot-title">Khung ảnh {imgIds.length ? `— đã chọn ${imgIds.length}` : ''}</span>
          <span className="muted">{shownImages.length}/{images.length}</span>
        </header>

        <div className="sx-preview">
          {previewImg ? (
            <img src={previewImg.url} alt={previewImg.title} />
          ) : (
            <div className="sx-preview-empty">
              <span aria-hidden="true">🖼️</span>
              <p>Chưa chọn ảnh (chọn nhiều được — ảnh dư thả bình luận sau khi đăng)</p>
            </div>
          )}
        </div>
        {previewImg ? (
          <p className="muted" style={{ margin: '4px 0', textAlign: 'center', fontSize: '.85rem' }}>
            {imgIds.includes(previewImg.id) ? '✓ đã chọn — ' : '👁 xem trước — '}<b>{previewImg.title}</b>
          </p>
        ) : null}

        {selectedImgs.length ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', margin: '8px 0' }}>
            <b className="muted" style={{ fontSize: '.85rem' }}>{selectedImgs.length} ảnh đã chọn:</b>{' '}
            {selectedImgs.map((a, i) => (
              <span key={a.id} className="chip on" style={{ display: 'inline-flex', gap: 6, alignItems: 'center', padding: '3px 6px' }}>
                <span style={{ background: '#16a34a', color: '#fff', width: 18, height: 18, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
                <img src={a.url} alt="" style={{ width: 28, height: 28, objectFit: 'cover', borderRadius: 3, cursor: 'pointer' }} onClick={() => setPreviewImgId(a.id)} title="Chuyển preview sang ảnh này" />
                <button type="button" onClick={() => setPreviewImgId(a.id)} title="Bấm để chuyển preview sang ảnh này" style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, fontSize: '.75rem', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>{a.title}</button>
                <button type="button" onClick={() => setLightbox({ kind: 'image', url: a.url, title: a.title })} title="Phóng to (Esc để đóng)" style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }}>🔍</button>
                <button type="button" onClick={() => onSelectImage(a)} title="Bỏ" style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }}>✕</button>
              </span>
            ))}
            <button type="button" className="btn ghost sm" onClick={() => { setImgIds([]); setPreviewImgId(''); }}>✕ Bỏ hết</button>
          </div>
        ) : null}

        {shownImages.length > 0 ? (
          <div className="sx-thumbs" role="listbox" aria-label="Chọn ảnh từ kho" aria-multiselectable="true">
            {shownImages.map((a) => {
              const on = imgIds.includes(a.id);
              const isPreview = previewImgId === a.id || (!previewImgId && firstImg?.id === a.id);
              return (
                <div
                  key={a.id}
                  role="option"
                  aria-selected={on}
                  className={`sx-thumb ${on ? 'on' : ''}`}
                  onClick={() => onSelectImage(a)}
                  title={a.title + ' — bấm để chọn/bỏ, bấm 🔍 để chỉ xem'}
                  style={{ position: 'relative', cursor: 'pointer', outline: isPreview ? '2px solid #3b82f6' : undefined }}
                >
                  <img src={a.url} alt={a.title} loading="lazy" />
                  {/* Nút zoom nhỏ góc trên trái: chỉ mở preview to, KHÔNG đổi chọn. */}
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); setLightbox({ kind: 'image', url: a.url, title: a.title }); }}
                    title="Phóng to (Esc để đóng) — không chọn"
                    style={{ position: 'absolute', top: 4, left: 4, background: 'rgba(0,0,0,0.6)', color: '#fff', width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, cursor: 'pointer' }}
                  >🔍</span>
                  {on ? (
                    <span style={{ position: 'absolute', top: 4, right: 4, background: '#16a34a', color: '#fff', width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{imgOrder(a.id)}</span>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="muted">{images.length ? 'Không có ảnh trong folder này. Bỏ lọc để xem tất cả.' : 'Kho ảnh đang trống. Tải ảnh lên bên dưới.'}</p>
        )}

        <AssetUploader kind="image" group={folder} />
      </section>

      <section className="sx-slot">
        <header className="sx-slot-head">
          <span className="sx-slot-title">Khung video {vidIds.length ? `— đã chọn ${vidIds.length}` : ''}</span>
          <span className="muted">{shownVideos.length}/{videos.length}</span>
        </header>

        <div className="sx-preview">
          {previewVid ? (
            <video key={previewVid.id} src={previewVid.url} controls preload="none" />
          ) : (
            <div className="sx-preview-empty">
              <span aria-hidden="true">🎬</span>
              <p>Chưa chọn video (chọn nhiều được — video đầu là bài chính)</p>
            </div>
          )}
        </div>
        {previewVid ? (
          <p className="muted" style={{ margin: '4px 0', textAlign: 'center', fontSize: '.85rem' }}>
            {vidIds.includes(previewVid.id) ? '✓ đã chọn — ' : '👁 xem trước — '}<b>{previewVid.title}</b>
          </p>
        ) : null}

        {selectedVids.length ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', margin: '8px 0' }}>
            <b className="muted" style={{ fontSize: '.85rem' }}>{selectedVids.length} video đã chọn:</b>{' '}
            {selectedVids.map((a, i) => (
              <span key={a.id} className="chip on" style={{ display: 'inline-flex', gap: 6, alignItems: 'center', padding: '3px 6px' }}>
                <span style={{ background: '#16a34a', color: '#fff', width: 18, height: 18, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
                <span style={{ position: 'relative', width: 28, height: 28, flexShrink: 0, cursor: 'pointer' }} onClick={() => setPreviewVidId(a.id)} title="Chuyển preview sang video này">
                  <video src={a.url} muted preload="none" style={{ width: 28, height: 28, objectFit: 'cover', borderRadius: 3, display: 'block' }} />
                  <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10, textShadow: '0 0 3px #000' }}>▶</span>
                </span>
                <button type="button" onClick={() => setPreviewVidId(a.id)} title="Bấm để chuyển preview sang video này" style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, fontSize: '.75rem', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>{a.title}</button>
                <button type="button" onClick={() => setLightbox({ kind: 'video', url: a.url, title: a.title })} title="Phóng to (Esc để đóng)" style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }}>🔍</button>
                <button type="button" onClick={() => onSelectVideo(a)} title="Bỏ" style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }}>✕</button>
              </span>
            ))}
            <button type="button" className="btn ghost sm" onClick={() => { setVidIds([]); setPreviewVidId(''); }}>✕ Bỏ hết</button>
          </div>
        ) : null}

        {shownVideos.length > 0 ? (
          <div className="sx-thumbs" role="listbox" aria-label="Chọn video từ kho" aria-multiselectable="true">
            {shownVideos.map((a) => {
              const on = vidIds.includes(a.id);
              const isPreview = previewVidId === a.id || (!previewVidId && firstVid?.id === a.id);
              return (
                <div
                  key={a.id}
                  role="option"
                  aria-selected={on}
                  className={`sx-thumb sx-thumb-video ${on ? 'on' : ''}`}
                  onClick={() => onSelectVideo(a)}
                  title={a.title + ' — bấm để chọn/bỏ, bấm 🔍 để chỉ xem'}
                  style={{ position: 'relative', cursor: 'pointer', outline: isPreview ? '2px solid #3b82f6' : undefined }}
                >
                  <video src={a.url} muted preload="none" />
                  <span className="sx-thumb-badge" aria-hidden="true">▶</span>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); setLightbox({ kind: 'video', url: a.url, title: a.title }); }}
                    title="Phóng to (Esc để đóng) — không chọn"
                    style={{ position: 'absolute', top: 4, left: 4, background: 'rgba(0,0,0,0.6)', color: '#fff', width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, cursor: 'pointer' }}
                  >🔍</span>
                  {on ? (
                    <span style={{ position: 'absolute', top: 4, right: 4, background: '#16a34a', color: '#fff', width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{vidOrder(a.id)}</span>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="muted">{videos.length ? 'Không có video trong folder này. Bỏ lọc để xem tất cả.' : 'Kho video đang trống. Tải video lên bên dưới.'}</p>
        )}

        <AssetUploader kind="video" group={folder} />
      </section>

      <ImageStudio
        productId={imgIds[0] || ''}
        productTitle={title || ''}
        onAttach={(id, meta) => {
          const productName = firstImg?.title || '';
          setImgIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
          router.refresh();
          if (meta?.banner) {
            const kwText = (title.trim() || cleanAssetName(productName)).trim();
            if (kwText && !genBusy) {
              if (!title.trim()) setTitle(cleanAssetName(productName));
              setMsg('Đã ghép xong. Đang tự sinh text theo hình...');
              runGenerate(kwText, 'giao_dich', null, productName, kind);
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
              {/* Bỏ "Kịch bản video" - AI dựng video đã đọc lời thoại luôn, không cần định dạng riêng. */}
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
              disabled={genBusy || (!title.trim() && !firstImg && !firstVid)}
            >
              {genBusy ? 'Đang sinh...' : '✨ Sinh text bằng AI'}
            </button>
            <span className="muted">
              Máy soạn nháp theo tiêu đề (kèm gợi ý từ tên tất cả ảnh/video đã chọn). Người sửa lại trước khi đẩy hàng đợi.
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
                style={{ display: 'inline-flex', gap: 6, alignItems: 'center', opacity: vidIds.length ? 1 : 0.5 }}
                title={vidIds.length ? '' : 'TikTok cần một video'}
              >
                <input
                  type="checkbox"
                  checked={postTt && !!vidIds.length}
                  disabled={!vidIds.length}
                  onChange={(e) => setPostTt(e.target.checked)}
                />{' '}
                TikTok {vidIds.length ? '' : '(cần video)'}
              </label>
            </span>
            {kind === 'article' && postTt && vidIds.length ? (
              <span style={{ color: '#d97706', fontSize: '.8rem' }}>
                ⚠️ Bài dài không hợp TikTok, caption sẽ bị rút gọn. Nên chọn "Bài ngắn" khi đăng TikTok.
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
                    <video src={videoJob.videoUrl} controls preload="none" style={{ marginTop: 10, maxWidth: '100%', maxHeight: 380, borderRadius: 6 }} />
                  ) : null}
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span>⏱️</span>
                    <b>Đã đợi hơn 30 phút mà chưa xong.</b>
                    <button type="button" className="btn ghost sm" onClick={() => setVideoJob(null)}>✕ Đóng</button>
                  </div>
                  <p className="muted" style={{ marginTop: 6, fontSize: '.85rem' }}>
                    GitHub Actions có thể đang xếp hàng. Yêu cầu vẫn còn, sẽ tự dựng khi tới lượt.
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

      {lightbox ? (
        <div
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20, cursor: 'zoom-out'
          }}
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setLightbox(null); }}
            aria-label="Đóng"
            style={{ position: 'absolute', top: 12, right: 16, background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none', width: 40, height: 40, borderRadius: '50%', fontSize: 20, cursor: 'pointer' }}
          >✕</button>
          <div style={{ maxWidth: '95vw', maxHeight: '85vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={(e) => e.stopPropagation()}>
            {lightbox.kind === 'image' ? (
              <img src={lightbox.url} alt={lightbox.title} style={{ maxWidth: '95vw', maxHeight: '85vh', objectFit: 'contain', borderRadius: 6 }} />
            ) : (
              <video src={lightbox.url} controls autoPlay style={{ maxWidth: '95vw', maxHeight: '85vh', borderRadius: 6 }} />
            )}
          </div>
          <p style={{ color: '#fff', marginTop: 12, fontSize: '.9rem', textAlign: 'center' }}>
            {lightbox.title} <span style={{ opacity: 0.6, marginLeft: 8 }}>· bấm ra ngoài hoặc Esc để đóng</span>
          </p>
        </div>
      ) : null}
    </div>
  );
}
