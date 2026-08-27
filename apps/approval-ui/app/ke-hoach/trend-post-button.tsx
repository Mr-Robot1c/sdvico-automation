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
    setMsg('Đang sinh bài + kịch bản video, chờ 20 tới 40 giây...');
    try {
      const r = await generateTrendPost(fd);
      setMsg(r.msg);
      if (r.ok) {
        setTimeout(() => {
          dialogRef.current?.close();
          setMsg('');
          router.push('/noi-dung?loai=bang');
        }, 2000);
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
              Playbook PHẦN 3: "thời sự nghề là xăng tăng lực viral miễn phí". Nhập sự kiện đang nóng — BOSS sinh 1 bài + kịch bản video 5-8 cảnh với keyword ảnh (bạn dựng bằng CapCut/InShot).
            </p>
          </div>
          <button type="button" className="btn ghost sm" onClick={close} disabled={pending}>✕ Đóng</button>
        </div>
        <form action={submit} style={{ display: 'grid', gap: 10 }}>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: '.85rem', fontWeight: 600 }}>Sự kiện đang nóng</span>
            <textarea
              name="trend_event"
              required
              minLength={5}
              maxLength={200}
              rows={2}
              placeholder="VD: Đội tuyển VN vô địch AFF Cup 2026 · Bão số 5 đổ bộ Biển Đông · Giải bơi lội quốc gia · Nghị định mới về IUU"
              className="input"
              style={{ padding: '8px 10px', fontFamily: 'inherit', resize: 'vertical' }}
            />
            <span className="sub" style={{ fontSize: '.75rem' }}>
              💡 BOSS tự MÓC sự kiện sang góc ngư dân (VD "VN vô địch → ngư dân treo cờ đỏ ra khơi").
              Bài vào Bảng chờ duyệt. Video: bạn tự dựng CapCut theo kịch bản 5-8 cảnh BOSS đưa ra.
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
