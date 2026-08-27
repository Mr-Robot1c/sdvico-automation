'use client';
// Nút "🔥 Sinh bài trend" — Playbook 27/8 Tầng 3. Bấm khi có sự kiện nóng (VN vô địch, bão,
// tin sốt xã hội). User nhập tên sự kiện + tùy chọn keyword ảnh → BOSS sinh 1 bài Facebook
// bám sự kiện (móc sang góc ngư dân) + kịch bản video 5-8 cảnh với ảnh keyword. Bài vào Bảng
// chờ duyệt. Video: user tự dựng CapCut/InShot bằng script + keyword ảnh gợi ý.

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { generateTrendPost } from '../actions';

export default function TrendPostButton() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState('');
  const router = useRouter();

  const open = () => dialogRef.current?.showModal();
  const close = () => { if (!pending) dialogRef.current?.close(); };

  const submit = async (fd: FormData) => {
    if (pending) return;
    setPending(true);
    setMsg('Đang tạo bài...');
    try {
      // Async pattern: server trả OK ngay, sinh nội dung background. Redirect sang Bảng
      // ngay → user thấy bài với badge "🔥 TREND (đang sinh)", F5 sẽ cập nhật khi xong.
      const r = await generateTrendPost(fd);
      setMsg(r.msg);
      if (r.ok) {
        setTimeout(() => {
          dialogRef.current?.close();
          setMsg('');
          router.push('/noi-dung?loai=bang');
        }, 1200);
      }
    } catch (e: any) {
      setMsg('⚠️ Lỗi: ' + (e?.message || 'không rõ'));
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="btn ghost sm"
        onClick={open}
        title="Playbook PHẦN 3: bám thời sự Việt Nam (VN vô địch, bão, sự kiện lớn) để viral miễn phí. BOSS sinh 1 bài Facebook + kịch bản video 5-8 cảnh với keyword ảnh (bạn dựng bằng CapCut/InShot)."
      >
        🔥 Sinh bài trend
      </button>
      <dialog
        ref={dialogRef}
        className="plan-quick-dialog"
        style={{ maxWidth: 580, width: '95vw', padding: 20 }}
        onClick={(e) => { if (e.target === dialogRef.current) close(); }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
          <div>
            <b style={{ fontSize: '1.05rem' }}>🔥 Sinh bài bám trend</b>
            <p className="sub" style={{ fontSize: '.85rem', margin: '4px 0 0' }}>
              Playbook PHẦN 3: "thời sự nghề là xăng tăng lực viral miễn phí". Nhập 1 hay nhiều sự kiện đang nóng (mỗi sự kiện 1 dòng hoặc cách nhau dấu phẩy) — BOSS sinh MỖI SỰ KIỆN 1 BÀI + kịch bản video với keyword ảnh Pexels.
            </p>
          </div>
          <button type="button" className="btn ghost sm" onClick={close} disabled={pending}>✕ Đóng</button>
        </div>
        <form action={submit} style={{ display: 'grid', gap: 10 }}>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: '.85rem', fontWeight: 600 }}>Sự kiện đang nóng (mỗi dòng 1 sự kiện, HOẶC cách nhau dấu phẩy)</span>
            <textarea
              name="trend_event"
              required
              minLength={5}
              maxLength={600}
              rows={4}
              placeholder={`VD nhập nhiều sự kiện — máy sinh 4 bài:
Đội tuyển VN vô địch AFF Cup 2026
Bão số 5 đổ bộ Biển Đông
Giải bơi lội quốc gia
Nghị định mới về IUU`}
              className="input"
              style={{ padding: '8px 10px', fontFamily: 'inherit', resize: 'vertical' }}
            />
            <span className="sub" style={{ fontSize: '.75rem' }}>
              💡 BOSS tự MÓC từng sự kiện sang góc ngư dân (VD "VN vô địch → ngư dân treo cờ đỏ ra khơi").
              <br />🎥 Máy sẽ TỰ TÌM ẢNH + VIDEO từ Pexels (CC0 miễn phí bản quyền) cho từng cảnh.
              <br />⚡ Bấm xong <b>redirect ngay</b> sang Bảng bài viết. Mỗi bài hiện với badge "đang sinh" ~30-60 giây. F5 sẽ thấy khi xong.
            </span>
          </label>
          {msg ? <div className="sub" style={{ fontSize: '.85rem', padding: '8px 10px', background: 'var(--bg-2)', borderRadius: 6 }}>{msg}</div> : null}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" className="btn ghost" onClick={close} disabled={pending}>Đóng</button>
            <button type="submit" className="btn ok" disabled={pending}>
              {pending ? '⏳ Đang sinh...' : '🔥 Sinh bài trend'}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
