'use client';
// Nút "🎯 Bung 1 ý thành 7 bài" — Playbook 26/8 item 2 (PHẦN 10). User 27/8 chuyển từ
// /noi-dung sang /ke-hoach (đây là việc lên kế hoạch nội dung, thuộc trang Kế hoạch).
// Modal dùng <dialog> HTML5 showModal() để browser tự lo backdrop — chắc chắn cover tất cả
// element phía sau, không bị lộ như div overlay fake.

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { generateSevenAngles } from '../actions';

const PRODUCT_OPTIONS = [
  { value: '', label: 'Không tập trung sản phẩm cụ thể' },
  { value: '1. PV Engine RMI Nano Graphene', label: '1. PV Engine RMI Nano Graphene (dầu nhớt)' },
  { value: '2. Máy lọc nước biển SEA-40', label: '2. Máy lọc nước biển SEA-40' },
  { value: '3. Thiết bị giám sát hành trình Viettel S-Tracking', label: '3. VMS S-Tracking' },
  { value: '4. Thuraya Marine Star MNB-01', label: '4. Thuraya MarineStar MNB-01' },
  { value: '5. Điện thoại vệ tinh XT-Pro', label: '5. XT-Pro (điện thoại vệ tinh)' },
  { value: '6. Thiết bị lọc dầu SF-50', label: '6. Máy lọc dầu SF-50' },
  { value: '7. Ắc quy Accu Nano SDViCo', label: '7. Ắc quy Accu Nano' },
  { value: '8. Sơn RARE', label: '8. Sơn RARE (chống nóng tàu)' },
  { value: '9. Máy Lọc Dầu Diesel SD12-300', label: '9. Máy lọc dầu Diesel SD12-300' },
];

export default function SevenAnglesButton() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState('');
  const router = useRouter();

  const open = () => dialogRef.current?.showModal();
  const close = () => { if (!pending) dialogRef.current?.close(); };

  const submit = async (fd: FormData) => {
    if (pending) return;
    setPending(true);
    setMsg('Đang sinh 7 bài, chờ 30 tới 60 giây...');
    try {
      const r = await generateSevenAngles(fd);
      if (r.ok) {
        setMsg(`✓ Đã sinh ${r.count} bài, vào Bảng bài viết duyệt/xóa.`);
        setTimeout(() => {
          dialogRef.current?.close();
          setMsg('');
          router.push('/noi-dung?loai=bang');
        }, 1500);
      } else {
        setMsg(`⚠️ Lỗi: ${r.error || 'không rõ'}`);
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
        title="Playbook PHẦN 10: từ 1 chủ đề, máy sinh 7 bài khác nhau về góc tiếp cận (cảnh báo, case study, so sánh, hướng dẫn, phản biện, cảm xúc, listicle). Dùng khi ra mắt SP mới hoặc seeding chủ đề nóng."
      >
        🎯 Bung 1 ý thành 7 bài
      </button>
      <dialog
        ref={dialogRef}
        className="plan-quick-dialog"
        style={{ maxWidth: 560, width: '95vw', padding: 20 }}
        onClick={(e) => { if (e.target === dialogRef.current) close(); }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
          <div>
            <b style={{ fontSize: '1.05rem' }}>🎯 Bung 1 ý thành 7 bài</b>
            <p className="sub" style={{ fontSize: '.85rem', margin: '4px 0 0' }}>
              Từ 1 chủ đề, máy sinh 7 bài khác nhau (cảnh báo · case study · so sánh · hướng dẫn · phản biện · cảm xúc · listicle). Mỗi bài vào Bảng chờ duyệt.
            </p>
          </div>
          <button type="button" className="btn ghost sm" onClick={close} disabled={pending}>✕ Đóng</button>
        </div>
        <form action={submit} style={{ display: 'grid', gap: 10 }}>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: '.85rem', fontWeight: 600 }}>Chủ đề chính</span>
            <textarea
              name="topic"
              required
              minLength={5}
              maxLength={500}
              rows={2}
              placeholder="VD: Cách chọn máy lọc dầu cho tàu 400 CV chạy đường dài, hoặc: Tiết kiệm dầu diesel mùa cao điểm khi giá tăng 38.000đ/lít"
              className="input"
              style={{ padding: '8px 10px', fontFamily: 'inherit', resize: 'vertical' }}
            />
          </label>
          <label style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontSize: '.85rem', fontWeight: 600 }}>Sản phẩm liên quan (tùy)</span>
            <select name="product_group" defaultValue="" className="input" style={{ padding: '6px 8px' }}>
              {PRODUCT_OPTIONS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
            <span className="sub" style={{ fontSize: '.75rem' }}>Chọn SP để bài có thêm lợi ích cụ thể; để trống nếu chủ đề chung không tập trung sản phẩm.</span>
          </label>
          {msg ? <div className="sub" style={{ fontSize: '.85rem', padding: '8px 10px', background: 'var(--bg-2)', borderRadius: 6 }}>{msg}</div> : null}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" className="btn ghost" onClick={close} disabled={pending}>Đóng</button>
            <button type="submit" className="btn ok" disabled={pending}>
              {pending ? '⏳ Đang sinh...' : '🎯 Sinh 7 bài'}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
