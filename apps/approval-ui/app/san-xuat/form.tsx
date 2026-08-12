'use client';

import { useState, useTransition } from 'react';
import { uploadAsset, generateTextForTitle, createContent } from '../actions';

type Asset = { id: string; kind: string; title: string; storage_path: string; url: string };

export default function SanXuatForm({ images, videos }: { images: Asset[]; videos: Asset[] }) {
  const [title, setTitle] = useState('');
  const [draft, setDraft] = useState('');
  const [kind, setKind] = useState<'social' | 'article' | 'video'>('social');
  const [imgId, setImgId] = useState<string>('');
  const [vidId, setVidId] = useState<string>('');
  const [genBusy, setGenBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [pending, startTransition] = useTransition();

  const selectedImg = images.find((a) => a.id === imgId);
  const selectedVid = videos.find((a) => a.id === vidId);

  const onGenerate = async () => {
    if (!title.trim()) {
      setMsg('Nhập tiêu đề trước khi sinh text.');
      return;
    }
    setGenBusy(true);
    setMsg('Đang sinh text...');
    try {
      const t = await generateTextForTitle(title.trim());
      setDraft(t);
      setMsg(t ? 'Đã sinh xong. Sửa lại rồi bấm Xong để đẩy vào hàng đợi.' : 'Sinh xong nhưng không có text — thử tiêu đề khác.');
    } catch (e: any) {
      setMsg('Lỗi sinh text: ' + (e?.message || e));
    } finally {
      setGenBusy(false);
    }
  };

  const onSubmit = (formData: FormData) => {
    formData.set('title', title);
    formData.set('draft', draft);
    formData.set('kind', kind);
    if (imgId) formData.set('image_asset_id', imgId);
    if (vidId) formData.set('video_asset_id', vidId);
    startTransition(async () => {
      setMsg('Đang tạo khung sườn và đẩy vào hàng đợi duyệt...');
      try {
        await createContent(formData);
        setMsg('Xong. Nội dung đã ở Hàng đợi duyệt, chờ người bấm Duyệt để đăng.');
        setTitle('');
        setDraft('');
        setImgId('');
        setVidId('');
      } catch (e: any) {
        setMsg('Lỗi tạo: ' + (e?.message || e));
      }
    });
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

        {images.length > 0 ? (
          <div className="sx-thumbs" role="listbox" aria-label="Chọn ảnh từ kho">
            {images.slice(0, 12).map((a) => (
              <button
                key={a.id}
                type="button"
                className={`sx-thumb ${imgId === a.id ? 'on' : ''}`}
                onClick={() => setImgId(a.id === imgId ? '' : a.id)}
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

        <form className="factform" action={uploadAsset} encType="multipart/form-data">
          <input type="file" name="file" accept="image/*" aria-label="Chọn ảnh từ máy" required />
          <input type="hidden" name="kind" value="image" />
          <input type="hidden" name="license" value="owned" />
          <input name="title" placeholder="Tên ảnh (tùy chọn)" aria-label="Tên ảnh" />
          <button className="btn ok" type="submit">Tải ảnh lên</button>
        </form>
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

        {videos.length > 0 ? (
          <div className="sx-thumbs" role="listbox" aria-label="Chọn video từ kho">
            {videos.slice(0, 8).map((a) => (
              <button
                key={a.id}
                type="button"
                className={`sx-thumb sx-thumb-video ${vidId === a.id ? 'on' : ''}`}
                onClick={() => setVidId(a.id === vidId ? '' : a.id)}
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

        <form className="factform" action={uploadAsset} encType="multipart/form-data">
          <input type="file" name="file" accept="video/*" aria-label="Chọn video từ máy" required />
          <input type="hidden" name="kind" value="video" />
          <input type="hidden" name="license" value="owned" />
          <input name="title" placeholder="Tên video (tùy chọn)" aria-label="Tên video" />
          <button className="btn ok" type="submit">Tải video lên</button>
        </form>
      </section>

      <section className="sx-compose">
        <header className="sx-slot-head">
          <span className="sx-slot-title">Soạn bài viết</span>
        </header>

        <form action={onSubmit} className="sx-form">
          <label className="sx-field">
            <span>Tiêu đề</span>
            <input
              className="note"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
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
              disabled={genBusy || !title.trim()}
            >
              {genBusy ? 'Đang sinh...' : '✨ Sinh text bằng AI'}
            </button>
            <span className="muted">Máy soạn nháp theo tiêu đề, người sửa lại trước khi đẩy hàng đợi.</span>
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
